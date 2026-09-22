from dataclasses import asdict
from typing import Any

import structlog
from deepeval.test_case import LLMTestCase

from ..core.config import settings
from ..core.executors import run_blocking
from ..core.mongo import get_jobs_collection
from ..schemas.summary_spec import OutputFormat
from ..services.metrics.cross import (
    compute_cross_metrics as compute_cross_metrics_sync,
)
from ..services.metrics.cross import (
    evaluate_pairwise_cross_deepeval,
)
from ..services.metrics.deepeval import (
    SUMMARY_INPUT_SPECS,
    SUMMARY_SPECS,
    TAKEAWAYS_INPUT_SPECS,
    TAKEAWAYS_SPECS,
    evaluate_geval,
)
from ..services.metrics.statistical import (
    source_metrics,
    summary_metrics,
)

log = structlog.get_logger(__name__)


async def store_job_metrics(job_id: str, update: dict) -> None:
    try:
        await get_jobs_collection().update_one({"job_id": job_id}, {"$set": update})
    except Exception:
        log.exception("metrics store failed")


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
    return await run_blocking(compute_cross_metrics_sync, reference_text, summary_text)


async def compute_pairwise_cross_deepeval_metrics(
    source_text: str,
    golden_summary: str,
    ai_summary: str,
) -> list[dict[str, Any]]:
    """actual_output=ai_summary, expected_output=golden_summary, so "score" here means

    "how much better is the AI summary than the golden one" — higher score favors AI.
    """
    return await evaluate_pairwise_cross_deepeval(
        settings=settings,
        source_text=source_text,
        summary_actual=ai_summary,
        summary_expected=golden_summary,
    )


async def store_source_metrics_for_job(job_id: str, text: str) -> None:
    metrics = await run_blocking(source_metrics, text)
    await store_job_metrics(job_id, {"metrics.source": metrics})
    log.debug("source metrics stored")


async def store_statistical_metrics_for_job(
    job_id: str,
    summary_text: str,
    source_text: str,
) -> None:
    metrics = await compute_statistical_metrics(summary_text, source_text)
    await store_job_metrics(job_id, {"metrics.summary": metrics["summary"]})
    log.debug("statistical metrics stored")


async def store_deepeval_metrics_for_job(
    job_id: str,
    summary_text: str,
    source_text: str,
    output_format: OutputFormat,
) -> None:
    metrics = await compute_deepeval_metrics(summary_text, source_text, output_format)
    await store_job_metrics(job_id, {"deepeval_metrics": metrics})
    log.debug("deepeval metrics stored")
