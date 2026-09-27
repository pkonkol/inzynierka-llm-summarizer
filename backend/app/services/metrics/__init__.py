from dataclasses import asdict
from typing import Any

from deepeval.test_case import LLMTestCase

from ...core.config import settings
from ...core.executors import run_blocking
from ...schemas.summary_spec import OutputFormat
from . import cross
from .deepeval import (
    SUMMARY_INPUT_SPECS,
    SUMMARY_SPECS,
    TAKEAWAYS_INPUT_SPECS,
    TAKEAWAYS_SPECS,
    evaluate_geval,
)
from .statistical import summary_metrics


async def compute_statistical_metrics(
    summary_text: str,
    source_text: str,
) -> dict:
    def compute() -> dict:
        return {"summary": summary_metrics(summary_text, source_text)}

    return await run_blocking(compute)


async def compute_deepeval_metrics(
    summary_text: str,
    source_text: str,
    output_format: OutputFormat,
) -> list[dict]:
    """summary_text/source_text are always non-empty (AI summary, required input_text).

    The list-quality judges (redundancy, coverage) only make sense for a bullet list, so they
    run when the spec asked for one.
    """
    summary_case = LLMTestCase(input="", actual_output=summary_text)
    summary_input_case = LLMTestCase(input=source_text, actual_output=summary_text)

    work = [
        *((spec, summary_case) for spec in SUMMARY_SPECS),
        *((spec, summary_input_case) for spec in SUMMARY_INPUT_SPECS),
    ]
    if output_format == "bullets":
        work += [
            *((spec, summary_case) for spec in TAKEAWAYS_SPECS),
            *((spec, summary_input_case) for spec in TAKEAWAYS_INPUT_SPECS),
        ]

    return [asdict(x) for x in await evaluate_geval(settings, work)]


async def compute_cross_metrics(
    reference_text: str,
    summary_text: str,
) -> dict[str, float]:
    return await run_blocking(cross.compute_cross_metrics, reference_text, summary_text)


async def compute_pairwise_cross_deepeval_metrics(
    source_text: str,
    golden_summary: str,
    ai_summary: str,
) -> list[dict[str, Any]]:
    """actual_output=ai_summary, expected_output=golden_summary, so "score" here means

    "how much better is the AI summary than the golden one" — higher score favors AI.
    """
    return await cross.evaluate_pairwise_cross_deepeval(
        settings=settings,
        source_text=source_text,
        summary_actual=ai_summary,
        summary_expected=golden_summary,
    )
