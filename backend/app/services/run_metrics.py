import asyncio
import logging
from dataclasses import asdict
from typing import Any

from ..core.config import settings
from ..core.mongo import get_jobs_collection
from ..services.metrics.cross import (
    compute_cross_metrics as compute_cross_metrics_sync,
    evaluate_pairwise_cross_deepeval,
)
from ..services.metrics.deepeval import (
    evaluate_summary_input_metrics,
    evaluate_summary_metrics,
    evaluate_summary_takeaways_metrics,
    evaluate_takeaways_input_metrics,
    evaluate_takeaways_metrics,
)
from ..services.metrics.deterministic import (
    key_takeaways_metrics,
    source_metrics,
    summary_metrics,
)

logger = logging.getLogger(__name__)


def join_takeaways(takeaways: list[str]) -> str:
    return "\n".join(f"- {item}" for item in takeaways)


async def store_job_metrics(job_id: str, update: dict) -> None:
    try:
        await get_jobs_collection().update_one({"job_id": job_id}, {"$set": update})
    except Exception:
        logger.exception("[job=%s] metrics store failed", job_id)


async def compute_source_metrics(text: str) -> dict:
    return await asyncio.to_thread(source_metrics, text)


async def compute_deterministic_metrics(
    summary_text: str,
    takeaways_text: str,
    source_text: str,
) -> dict:
    sm = await asyncio.to_thread(summary_metrics, summary_text, source_text)
    kt = await asyncio.to_thread(key_takeaways_metrics, takeaways_text)

    return {
        "summary": sm,
        "key_takeaways": kt,
    }


async def compute_deepeval_metrics(
    summary_text: str,
    takeaways_text: str,
    source_text: str,
) -> list[dict]:
    """summary_text/source_text are always non-empty (AI summary, required input_text).
    takeaways_text can genuinely be empty — the LLM may return zero key takeaways."""
    summary_results = await evaluate_summary_metrics(settings, summary_text)
    summary_input_results = await evaluate_summary_input_metrics(settings, source_text, summary_text)
    takeaways_results = await evaluate_takeaways_metrics(settings, takeaways_text) if takeaways_text else []
    takeaways_input_results = (
        await evaluate_takeaways_input_metrics(settings, source_text, takeaways_text)
        if takeaways_text
        else []
    )
    summary_takeaways_results = (
        await evaluate_summary_takeaways_metrics(settings, source_text, summary_text, takeaways_text)
        if takeaways_text
        else []
    )

    return [
        asdict(x)
        for results in (
            summary_results,
            summary_input_results,
            takeaways_results,
            takeaways_input_results,
            summary_takeaways_results,
        )
        for x in results
    ]


async def compute_cross_metrics(
    reference_text: str,
    summary_text: str,
) -> dict[str, float]:
    return await asyncio.to_thread(compute_cross_metrics_sync, reference_text, summary_text)


async def compute_pairwise_cross_deepeval_metrics(
    source_text: str,
    golden_summary: str,
    ai_summary: str,
) -> list[dict[str, Any]]:
    return await evaluate_pairwise_cross_deepeval(
        settings=settings,
        source_text=source_text,
        summary_a=golden_summary,
        summary_b=ai_summary,
    )


async def store_source_metrics_for_job(job_id: str, text: str) -> None:
    metrics = await compute_source_metrics(text)
    await store_job_metrics(job_id, {"metrics.source": metrics})
    logger.debug("[job=%s] source metrics stored", job_id)


async def store_deterministic_metrics_for_job(
    job_id: str,
    summary_text: str,
    takeaways_text: str,
    source_text: str,
) -> None:
    metrics = await compute_deterministic_metrics(summary_text, takeaways_text, source_text)
    await store_job_metrics(
        job_id,
        {
            "metrics.summary": metrics["summary"],
            "metrics.key_takeaways": metrics["key_takeaways"],
        },
    )
    logger.debug("[job=%s] summary/takeaways metrics stored (compression folded into summary)", job_id)


async def store_deepeval_metrics_for_job(
    job_id: str,
    summary_text: str,
    takeaways_text: str,
    source_text: str,
) -> None:
    metrics = await compute_deepeval_metrics(summary_text, takeaways_text, source_text)
    await store_job_metrics(job_id, {"deepeval_metrics": metrics})
    logger.debug("[job=%s] deepeval metrics stored", job_id)