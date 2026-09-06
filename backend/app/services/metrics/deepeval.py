from __future__ import annotations

import asyncio
import threading
from dataclasses import dataclass
from typing import Any

import structlog
from deepeval.config.settings import get_settings as get_deepeval_settings
from deepeval.metrics import GEval
from deepeval.models import DeepEvalBaseLLM
from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from langchain_core.language_models import BaseChatModel
from langchain_core.runnables import Runnable

from ...core.config import Settings
from ..llm._base import build_llm, extract_text_from_content

log = structlog.get_logger(__name__)

DEEPEVAL_THRESHOLD = 0.5

_OLLAMA_CONCURRENCY_LIMIT = threading.Semaphore(2)
_LOGGED_RESPONSE_CHARS = 200


def _truncated(text: str) -> str:
    return text if len(text) <= _LOGGED_RESPONSE_CHARS else text[:_LOGGED_RESPONSE_CHARS] + "..."


class _LangchainDeepEvalModel(DeepEvalBaseLLM):
    def __init__(
        self, chat_model: BaseChatModel | Runnable[Any, Any], model_name: str, is_ollama: bool
    ) -> None:
        self._chat_model = chat_model
        self._model_name = model_name
        self._is_ollama = is_ollama

    def load_model(self) -> BaseChatModel | Runnable[Any, Any]:
        return self._chat_model

    def generate(self, prompt: str) -> str:
        log.debug("deepeval judge model generate", model=self._model_name)
        if self._is_ollama:
            with _OLLAMA_CONCURRENCY_LIMIT:
                response = self._chat_model.invoke(prompt)
        else:
            response = self._chat_model.invoke(prompt)
        text = extract_text_from_content(response.content)
        log.debug(
            "deepeval judge model response", model=self._model_name, response=_truncated(text)
        )
        return text

    async def a_generate(self, prompt: str) -> str:
        log.debug("deepeval judge model a_generate", model=self._model_name)
        if self._is_ollama:
            with _OLLAMA_CONCURRENCY_LIMIT:
                response = await self._chat_model.ainvoke(prompt)
        else:
            response = await self._chat_model.ainvoke(prompt)
        text = extract_text_from_content(response.content)
        log.debug(
            "deepeval judge model response", model=self._model_name, response=_truncated(text)
        )
        return text

    def get_model_name(self) -> str:
        return self._model_name


@dataclass(slots=True)
class DeepEvalMetricResult:
    name: str
    score: float
    reason: str
    passed: bool


_timeout_applied = False


def _apply_deepeval_timeout_override(timeout_seconds: int) -> None:
    global _timeout_applied
    if _timeout_applied:
        return
    with get_deepeval_settings().edit(persist=False) as ctx:
        ctx.s.DEEPEVAL_PER_TASK_TIMEOUT_SECONDS_OVERRIDE = timeout_seconds
    _timeout_applied = True
    log.info("deepeval per-task timeout overridden", timeout_seconds=timeout_seconds)


def build_deepeval_model(settings: Settings) -> DeepEvalBaseLLM:
    if settings.deepeval_timeout_seconds:
        _apply_deepeval_timeout_override(settings.deepeval_timeout_seconds)

    model_provider = settings.deepeval_judge_model["model_provider"]
    model_name = settings.deepeval_judge_model["model_name"]
    log.info("building deepeval judge model", provider=model_provider, model=model_name)
    chat_model = build_llm(model_provider, model_name)
    if model_provider.lower() == "openrouter":
        chat_model = chat_model.bind(response_format={"type": "json_object"})
    return _LangchainDeepEvalModel(
        chat_model, model_name, is_ollama=model_provider.lower() == "ollama"
    )


def run_metric(metric: Any, test_case: LLMTestCase) -> DeepEvalMetricResult:
    metric.measure(test_case, _show_indicator=False)
    result = DeepEvalMetricResult(
        name=metric.name,
        score=metric.score,
        reason=metric.reason,
        passed=metric.success,
    )
    log.info(
        "deepeval metric measured",
        metric=result.name,
        model=getattr(metric, "evaluation_model", None),
        score=result.score,
        passed=result.passed,
    )
    return result


@dataclass(frozen=True, slots=True)
class GEvalSpec:
    """The per-judge half of a GEval metric; the model and threshold are shared by all of them."""

    name: str
    criteria: str
    params: list[LLMTestCaseParams]
    evaluation_steps: list[str] | None = None


SUMMARY_SPECS = [
    GEvalSpec(
        name="summary_coherence",
        criteria=(
            "Assess whether the summary is logically coherent, thematically consistent, and easy to follow "
            "for its length. A single-sentence summary can score highly if it presents one clear, unified idea "
            "without contradictions, abrupt shifts, or confusing structure."
        ),
        params=[LLMTestCaseParams.ACTUAL_OUTPUT],
    ),
    GEvalSpec(
        name="summary_fluency",
        criteria=(
            "Assess whether the summary is fluent, grammatically correct, natural-sounding, "
            "and easy to read. Penalize awkward wording, grammar mistakes, and unnatural phrasing."
        ),
        params=[LLMTestCaseParams.ACTUAL_OUTPUT],
    ),
]

SUMMARY_INPUT_SPECS = [
    GEvalSpec(
        name="summary_completeness",
        criteria=(
            "Assess whether the summary preserves the key information from the input text "
            "without omitting major facts, claims, or conclusions."
        ),
        params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
    ),
]

TAKEAWAYS_SPECS = [
    GEvalSpec(
        name="takeaways_non_redundancy",
        criteria=(
            "Assess whether the key takeaways are non-redundant. Penalize repeated ideas, "
            "near-duplicate bullets, and multiple points that express the same fact."
        ),
        params=[LLMTestCaseParams.ACTUAL_OUTPUT],
    ),
]

TAKEAWAYS_INPUT_SPECS = [
    GEvalSpec(
        name="takeaways_coverage",
        criteria=(
            "Assess whether the key takeaways cover the most important facts and ideas from the input text. "
            "Penalize missing major points and overemphasis on minor details."
        ),
        params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
    ),
]

SUMMARY_TAKEAWAYS_SPECS = [
    GEvalSpec(
        name="summary_covers_takeaways",
        criteria=(
            "Assess whether the summary covers the factual content expressed in the key takeaways. "
            "Penalize omission of major takeaway points, contradictions, and summaries that are "
            "too generic relative to the takeaways."
        ),
        params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
    ),
]


async def evaluate_geval(
    settings: Settings, work: list[tuple[GEvalSpec, LLMTestCase]]
) -> list[DeepEvalMetricResult]:
    """Run every (spec, test case) pair concurrently against a single judge model.

    Results come back in the order the pairs were given, so callers can rely on positions.
    """
    if not work:
        return []
    model = build_deepeval_model(settings)
    metrics = [
        GEval(
            name=spec.name,
            model=model,
            threshold=DEEPEVAL_THRESHOLD,
            criteria=spec.criteria,
            evaluation_params=spec.params,
            **({"evaluation_steps": spec.evaluation_steps} if spec.evaluation_steps else {}),
        )
        for spec, _ in work
    ]
    return list(
        await asyncio.gather(
            *(
                asyncio.to_thread(run_metric, metric, test_case)
                for metric, (_, test_case) in zip(metrics, work, strict=True)
            )
        )
    )
