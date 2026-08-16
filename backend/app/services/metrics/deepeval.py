from __future__ import annotations

import asyncio
import threading
from dataclasses import dataclass
from typing import Any

import structlog
from deepeval.config.settings import get_settings as get_deepeval_settings
from deepeval.metrics import GEval, SummarizationMetric
from deepeval.models import DeepEvalBaseLLM
from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from langchain_core.language_models import BaseChatModel

from ...core.config import Settings
from ..llm._base import build_llm, extract_text_from_content

log = structlog.get_logger(__name__)

DEEPEVAL_THRESHOLD = 0.5

_OLLAMA_CONCURRENCY_LIMIT = threading.Semaphore(2)
_LOGGED_RESPONSE_CHARS = 200


def _truncated(text: str) -> str:
    return text if len(text) <= _LOGGED_RESPONSE_CHARS else text[:_LOGGED_RESPONSE_CHARS] + "..."


class _LangchainDeepEvalModel(DeepEvalBaseLLM):
    def __init__(self, chat_model: BaseChatModel, model_name: str, is_ollama: bool) -> None:
        self._chat_model = chat_model
        self._model_name = model_name
        self._is_ollama = is_ollama

    def load_model(self) -> BaseChatModel:
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
    return _LangchainDeepEvalModel(
        chat_model, model_name, is_ollama=model_provider.lower() == "ollama"
    )


def run_metric(metric: Any, test_case: LLMTestCase) -> DeepEvalMetricResult:
    metric.measure(test_case, _show_indicator=False)
    result = DeepEvalMetricResult(
        name=getattr(metric, "name", None)
        or getattr(metric, "__name__", None)
        or type(metric).__name__,
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


def build_summary_metrics(settings: Settings) -> list[Any]:
    model = build_deepeval_model(settings)

    return [
        GEval(
            name="summary_coherence",
            model=model,
            threshold=DEEPEVAL_THRESHOLD,
            criteria=(
                "Assess whether the summary is logically coherent, thematically consistent, and easy to follow "
                "for its length. A single-sentence summary can score highly if it presents one clear, unified idea "
                "without contradictions, abrupt shifts, or confusing structure."
            ),
            evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT],
        ),
        GEval(
            name="summary_fluency",
            model=model,
            threshold=DEEPEVAL_THRESHOLD,
            criteria=(
                "Assess whether the summary is fluent, grammatically correct, natural-sounding, "
                "and easy to read. Penalize awkward wording, grammar mistakes, and unnatural phrasing."
            ),
            evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT],
        ),
    ]


def build_summary_input_metrics(settings: Settings) -> list[Any]:
    model = build_deepeval_model(settings)

    return [
        SummarizationMetric(
            model=model,
            threshold=DEEPEVAL_THRESHOLD,
        ),
        GEval(
            name="summary_completeness",
            model=model,
            threshold=DEEPEVAL_THRESHOLD,
            criteria=(
                "Assess whether the summary preserves the key information from the input text "
                "without omitting major facts, claims, or conclusions."
            ),
            evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        ),
    ]


def build_takeaways_metrics(settings: Settings) -> list[Any]:
    model = build_deepeval_model(settings)

    return [
        GEval(
            name="takeaways_non_redundancy",
            model=model,
            threshold=DEEPEVAL_THRESHOLD,
            criteria=(
                "Assess whether the key takeaways are non-redundant. Penalize repeated ideas, "
                "near-duplicate bullets, and multiple points that express the same fact."
            ),
            evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT],
        ),
    ]


def build_takeaways_input_metrics(settings: Settings) -> list[Any]:
    model = build_deepeval_model(settings)

    return [
        GEval(
            name="takeaways_coverage",
            model=model,
            threshold=DEEPEVAL_THRESHOLD,
            criteria=(
                "Assess whether the key takeaways cover the most important facts and ideas from the input text. "
                "Penalize missing major points and overemphasis on minor details."
            ),
            evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        ),
    ]


def build_summary_takeaways_metrics(settings: Settings) -> list[Any]:
    model = build_deepeval_model(settings)

    return [
        GEval(
            name="summary_covers_takeaways",
            model=model,
            threshold=DEEPEVAL_THRESHOLD,
            criteria=(
                "Assess whether the summary covers the factual content expressed in the key takeaways. "
                "Penalize omission of major takeaway points, contradictions, and summaries that are "
                "too generic relative to the takeaways."
            ),
            evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        ),
    ]


async def evaluate_summary_metrics(settings: Settings, summary: str) -> list[DeepEvalMetricResult]:
    test_case = LLMTestCase(input="", actual_output=summary)
    metrics = build_summary_metrics(settings)
    return await asyncio.gather(
        *(asyncio.to_thread(run_metric, metric, test_case) for metric in metrics)
    )


async def evaluate_summary_input_metrics(
    settings: Settings,
    article_text: str,
    summary: str,
) -> list[DeepEvalMetricResult]:
    test_case = LLMTestCase(input=article_text, actual_output=summary)
    metrics = build_summary_input_metrics(settings)
    return await asyncio.gather(
        *(asyncio.to_thread(run_metric, metric, test_case) for metric in metrics)
    )


async def evaluate_takeaways_metrics(
    settings: Settings, takeaways_text: str
) -> list[DeepEvalMetricResult]:
    test_case = LLMTestCase(input="", actual_output=takeaways_text)
    metrics = build_takeaways_metrics(settings)
    return await asyncio.gather(
        *(asyncio.to_thread(run_metric, metric, test_case) for metric in metrics)
    )


async def evaluate_takeaways_input_metrics(
    settings: Settings,
    article_text: str,
    takeaways_text: str,
) -> list[DeepEvalMetricResult]:
    test_case = LLMTestCase(input=article_text, actual_output=takeaways_text)
    metrics = build_takeaways_input_metrics(settings)
    return await asyncio.gather(
        *(asyncio.to_thread(run_metric, metric, test_case) for metric in metrics)
    )


async def evaluate_summary_takeaways_metrics(
    settings: Settings,
    article_text: str,
    summary: str,
    takeaways_text: str,
) -> list[DeepEvalMetricResult]:
    test_case = LLMTestCase(
        input=article_text,
        actual_output=summary,
        expected_output=takeaways_text,
    )
    metrics = build_summary_takeaways_metrics(settings)
    return await asyncio.gather(
        *(asyncio.to_thread(run_metric, metric, test_case) for metric in metrics)
    )
