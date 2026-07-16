# backend/app/services/deepeval_metrics.py

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from typing import Any

from deepeval.metrics import GEval, SummarizationMetric
from deepeval.models import GeminiModel
from deepeval.test_case import LLMTestCase, LLMTestCaseParams

from app.core.config import Settings

DEEPEVAL_THRESHOLD = 0.5

@dataclass(slots=True)
class DeepEvalMetricResult:
    name: str
    score: float | None
    reason: str | None
    passed: bool | None


def _build_deepeval_model(settings: Settings):
    provider = settings.deepeval_provider.lower()
    # temperature = settings.deepeval_temperature
    model_name = settings.deepeval_model

    if provider != "google":
        raise ValueError(f"Unsupported DeepEval provider: {settings.deepeval_provider}")

    if not settings.gemini_api_key:
        raise ValueError("GOOGLE_API_KEY is required for DeepEval with Google provider")
    return GeminiModel(api_key=settings.gemini_api_key.get_secret_value(), model=model_name)


def _run_metric(metric, test_case: LLMTestCase) -> DeepEvalMetricResult:
    metric.measure(test_case, _show_indicator=False)
    return DeepEvalMetricResult(
        # TODO overkill sprawdzen znowu?
        name=metric.__class__.__name__ if not getattr(metric, "name", None) else metric.name,
        score=getattr(metric, "score", None),
        reason=getattr(metric, "reason", None),
        passed=getattr(metric, "success", None),
    )


def build_summary_metrics(settings: Settings) -> list[Any]:
    model = _build_deepeval_model(settings)

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
            # criteria=(
            #     "Assess whether the summary is coherent, logically ordered, and easy to follow. "
            #     "Penalize abrupt topic jumps, broken flow, or unclear structure."
            # ),
            evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT], # pyright: ignore[reportAttributeAccessIssue]
        ),
        GEval(
            name="summary_fluency",
            model=model,
            threshold=DEEPEVAL_THRESHOLD,
            criteria=(
                "Assess whether the summary is fluent, grammatically correct, natural-sounding, "
                "and easy to read. Penalize awkward wording, grammar mistakes, and unnatural phrasing."
            ),
            evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT], # pyright: ignore[reportAttributeAccessIssue]
        ),
    ]


def build_summary_input_metrics(settings: Settings) -> list[Any]:
    model = _build_deepeval_model(settings)

    metrics: list[Any] = [
        # nie sprawdzalo sie, twierdzilo ze summary halucynuje jesli skupilo sie na innych faktach. Moze musialbym te prompty
        # jakos bardziej dopasowac. TODO
        #     assessment_questions=assessment_questions,
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
            evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT], # pyright: ignore[reportAttributeAccessIssue]
        ),
    ]
    return metrics


def build_takeaways_metrics(settings: Settings) -> list[Any]:
    model = _build_deepeval_model(settings)

    return [
        GEval(
            name="takeaways_non_redundancy",
            model=model,
            threshold=DEEPEVAL_THRESHOLD,
            criteria=(
                "Assess whether the key takeaways are non-redundant. Penalize repeated ideas, "
                "near-duplicate bullets, and multiple points that express the same fact."
            ),
            evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT], # pyright: ignore[reportAttributeAccessIssue]
        ),
    ]


def build_takeaways_input_metrics(settings: Settings) -> list[Any]:
    model = _build_deepeval_model(settings)

    return [
        GEval(
            name="takeaways_coverage",
            model=model,
            threshold=DEEPEVAL_THRESHOLD,
            criteria=(
                "Assess whether the key takeaways cover the most important facts and ideas from the input text. "
                "Penalize missing major points and overemphasis on minor details."
            ),
            evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT], # pyright: ignore[reportAttributeAccessIssue]
        ),
    ]


def build_summary_takeaways_metrics(settings: Settings) -> list[Any]:
    model = _build_deepeval_model(settings)

    h = GEval(
        name="summary_covers_takeaways",
        model=model,
        threshold=DEEPEVAL_THRESHOLD,
        criteria=(
            "Assess whether the summary covers the factual content expressed in the key takeaways. "
            "Penalize omission of major takeaway points, contradictions, and summaries that are "
            "too generic relative to the takeaways."
        ),
        #  LLMTestCaseParams.EXPECTED_OUTPUT], co do czeg podstawic? ma byc input takeaways -> output summary. Chyba
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT], # pyright: ignore[reportAttributeAccessIssue]
    )
    # h.measure
    # LLMTestCaseParams.INPUT
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
            #  LLMTestCaseParams.EXPECTED_OUTPUT], co do czeg podstawic? ma byc input takeaways -> output summary. Chyba
            evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT], # pyright: ignore[reportAttributeAccessIssue]
        ),
    ]


async def evaluate_summary_metrics(settings: Settings, summary: str) -> list[DeepEvalMetricResult]:
    test_case = LLMTestCase(input="", actual_output=summary)
    metrics = build_summary_metrics(settings)
    return await asyncio.gather(*(asyncio.to_thread(_run_metric, metric, test_case) for metric in metrics))


async def evaluate_summary_input_metrics(
    settings: Settings,
    article_text: str,
    summary: str,
    assessment_questions: list[str] | None = None,
) -> list[DeepEvalMetricResult]:
    test_case = LLMTestCase(input=article_text, actual_output=summary)
    metrics = build_summary_input_metrics(settings)
    return await asyncio.gather(*(asyncio.to_thread(_run_metric, metric, test_case) for metric in metrics))


async def evaluate_takeaways_metrics(settings: Settings, takeaways_text: str) -> list[DeepEvalMetricResult]:
    test_case = LLMTestCase(input="", actual_output=takeaways_text)
    metrics = build_takeaways_metrics(settings)
    return await asyncio.gather(*(asyncio.to_thread(_run_metric, metric, test_case) for metric in metrics))


async def evaluate_takeaways_input_metrics(
    settings: Settings,
    article_text: str,
    takeaways_text: str,
) -> list[DeepEvalMetricResult]:
    test_case = LLMTestCase(input=article_text, actual_output=takeaways_text)
    metrics = build_takeaways_input_metrics(settings)
    return await asyncio.gather(*(asyncio.to_thread(_run_metric, metric, test_case) for metric in metrics))


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
    return await asyncio.gather(*(asyncio.to_thread(_run_metric, metric, test_case) for metric in metrics))
