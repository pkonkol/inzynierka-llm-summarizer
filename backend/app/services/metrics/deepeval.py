from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass
from typing import Any

import structlog
from deepeval.config.settings import get_settings as get_deepeval_settings
from deepeval.metrics import GEval, SummarizationMetric
from deepeval.models import DeepEvalBaseLLM
from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from langchain_core.language_models import BaseChatModel
from langchain_core.runnables import Runnable

from ...core.config import settings
from ...core.executors import run_geval
from ..llm import build_llm, extract_text_from_content
from .fact_level_judges import JudgeModelRef

log = structlog.get_logger(__name__)

DEEPEVAL_THRESHOLD = 0.5

_LOGGED_RESPONSE_CHARS = 200


def _truncated(text: str) -> str:
    return text if len(text) <= _LOGGED_RESPONSE_CHARS else text[:_LOGGED_RESPONSE_CHARS] + "..."


class _LangchainDeepEvalModel(DeepEvalBaseLLM):
    def __init__(self, chat_model: BaseChatModel | Runnable[Any, Any], model_name: str) -> None:
        self._chat_model = chat_model
        self._model_name = model_name

    def load_model(self) -> BaseChatModel | Runnable[Any, Any]:
        return self._chat_model

    def generate(self, prompt: str) -> str:
        log.debug("deepeval judge model generate", model=self._model_name)
        response = self._chat_model.invoke(prompt)
        text = extract_text_from_content(response.content)
        log.debug(
            "deepeval judge model response", model=self._model_name, response=_truncated(text)
        )
        return text

    async def a_generate(self, prompt: str) -> str:
        log.debug("deepeval judge model a_generate", model=self._model_name)
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
    judge_model: str
    rubric_version: str


_timeout_applied = False


def _apply_deepeval_timeout_override(timeout_seconds: int) -> None:
    global _timeout_applied
    if _timeout_applied:
        return
    with get_deepeval_settings().edit(persist=False) as ctx:
        ctx.s.DEEPEVAL_PER_TASK_TIMEOUT_SECONDS_OVERRIDE = timeout_seconds
    _timeout_applied = True
    log.info("deepeval per-task timeout overridden", timeout_seconds=timeout_seconds)


def _build_deepeval_model(judge: JudgeModelRef) -> DeepEvalBaseLLM:
    if settings.deepeval_timeout_seconds:
        _apply_deepeval_timeout_override(settings.deepeval_timeout_seconds)

    log.info("building deepeval judge model", provider=judge.provider, model=judge.name)
    chat_model = build_llm(judge.provider, judge.name)
    if judge.provider.lower() == "openrouter":
        chat_model = chat_model.bind(response_format={"type": "json_object"})
    return _LangchainDeepEvalModel(chat_model, judge.name)


_judge_models: dict[str, DeepEvalBaseLLM] = {}


def get_deepeval_judge_model(judge: JudgeModelRef) -> DeepEvalBaseLLM:
    """One build per judge model. Each build opens an HTTP client that is never closed."""
    if judge.model_id() not in _judge_models:
        _judge_models[judge.model_id()] = _build_deepeval_model(judge)
    return _judge_models[judge.model_id()]


def run_metric(
    metric: Any, test_case: LLMTestCase, name: str, judge_model: str, rubric: str
) -> DeepEvalMetricResult:
    metric.measure(test_case, _show_indicator=False)
    result = DeepEvalMetricResult(
        name=name,
        score=metric.score,
        reason=metric.reason,
        passed=metric.success,
        judge_model=judge_model,
        rubric_version=rubric,
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


def rubric_version(spec: GEvalSpec) -> str:
    """First 8 hex chars of sha256 over everything the judge is shown, so any wording change is a new version."""
    rubric = {
        "name": spec.name,
        "criteria": spec.criteria,
        "params": [param.value for param in spec.params],
        "evaluation_steps": spec.evaluation_steps,
    }
    return hashlib.sha256(json.dumps(rubric, sort_keys=True).encode()).hexdigest()[:8]


SUMMARIZATION_METRIC_QUESTIONS = 5
# deepeval generates its own questions and truths, so the version names the settings rather than a rubric text.
SUMMARIZATION_METRIC_RUBRIC = f"summarization-n{SUMMARIZATION_METRIC_QUESTIONS}"


async def evaluate_summarization_metric(
    judge: JudgeModelRef, source_text: str, summary: str
) -> DeepEvalMetricResult:
    """deepeval's SummarizationMetric, as an off-the-shelf reference point."""
    model = get_deepeval_judge_model(judge)
    test_case = LLMTestCase(input=source_text, actual_output=summary)

    def measure() -> DeepEvalMetricResult:
        metric = SummarizationMetric(
            model=model,
            threshold=DEEPEVAL_THRESHOLD,
            n=SUMMARIZATION_METRIC_QUESTIONS,
            async_mode=False,  # same reason as in evaluate_geval
        )
        return run_metric(
            metric,
            test_case,
            "summarization_metric",
            judge.model_id(),
            SUMMARIZATION_METRIC_RUBRIC,
        )

    return await run_geval(measure)


async def evaluate_geval(
    judge: JudgeModelRef, work: list[tuple[GEvalSpec, LLMTestCase]]
) -> list[DeepEvalMetricResult]:
    """Run every (spec, test case) pair against a single judge model.

    `run_geval` bounds how many judges are in flight at once, process-wide, so two
    concurrent callers cannot add up past the limit.

    Results come back in the order the pairs were given, so callers can rely on positions.
    """
    if not work:
        return []
    model = get_deepeval_judge_model(judge)
    judge_model = judge.model_id()

    def measure(spec: GEvalSpec, test_case: LLMTestCase) -> DeepEvalMetricResult:
        metric = GEval(
            name=spec.name,
            model=model,
            threshold=DEEPEVAL_THRESHOLD,
            criteria=spec.criteria,
            evaluation_params=spec.params,
            async_mode=False,  # this already runs on its own thread; deepeval's async path opens an event loop per worker thread and never closes it
            **({"evaluation_steps": spec.evaluation_steps} if spec.evaluation_steps else {}),
        )
        return run_metric(metric, test_case, spec.name, judge_model, rubric_version(spec))

    return list(
        await asyncio.gather(*(run_geval(measure, spec, test_case) for spec, test_case in work))
    )
