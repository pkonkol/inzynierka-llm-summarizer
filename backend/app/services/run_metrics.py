import asyncio
import logging
from dataclasses import asdict

from ..core.config import settings
from ..core.mongo import get_jobs_collection
from ..services.deepeval_metrics import (
    evaluate_summary_input_metrics,
    evaluate_summary_metrics,
    evaluate_summary_takeaways_metrics,
    evaluate_takeaways_input_metrics,
    evaluate_takeaways_metrics,
)
from ..services.deterministic_metrics import (
    compression_ratio_metrics,
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
    sm = await asyncio.to_thread(summary_metrics, summary_text)
    kt = await asyncio.to_thread(key_takeaways_metrics, takeaways_text)
    cr = await asyncio.to_thread(compression_ratio_metrics, source_text, summary_text)

    return {
        "summary": sm,
        "key_takeaways": kt,
        "compression": cr,
    }


async def compute_deepeval_metrics(
    summary_text: str,
    takeaways_text: str,
    source_text: str,
) -> dict:
    summary_results = await evaluate_summary_metrics(settings, summary_text) if summary_text else []
    summary_input_results = (
        await evaluate_summary_input_metrics(settings, source_text, summary_text)
        if summary_text and source_text
        else []
    )
    takeaways_results = await evaluate_takeaways_metrics(settings, takeaways_text) if takeaways_text else []
    takeaways_input_results = (
        await evaluate_takeaways_input_metrics(settings, source_text, takeaways_text)
        if takeaways_text and source_text
        else []
    )
    summary_takeaways_results = (
        await evaluate_summary_takeaways_metrics(settings, source_text, summary_text, takeaways_text)
        if summary_text and takeaways_text and source_text
        else []
    )

    return {
        "summary": [asdict(x) for x in summary_results],
        "summary_input": [asdict(x) for x in summary_input_results],
        "takeaways": [asdict(x) for x in takeaways_results],
        "takeaways_input": [asdict(x) for x in takeaways_input_results],
        "summary_takeaways": [asdict(x) for x in summary_takeaways_results],
    }


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
            "metrics.compression": metrics["compression"],
        },
    )
    logger.debug("[job=%s] summary/takeaways/compression metrics stored", job_id)


async def store_deepeval_metrics_for_job(
    job_id: str,
    summary_text: str,
    takeaways_text: str,
    source_text: str,
) -> None:
    metrics = await compute_deepeval_metrics(summary_text, takeaways_text, source_text)
    await store_job_metrics(
        job_id,
        {
            "deepeval_metrics.summary": metrics["summary"],
            "deepeval_metrics.summary_input": metrics["summary_input"],
            "deepeval_metrics.takeaways": metrics["takeaways"],
            "deepeval_metrics.takeaways_input": metrics["takeaways_input"],
            "deepeval_metrics.summary_takeaways": metrics["summary_takeaways"],
        },
    )
    logger.debug("[job=%s] deepeval metrics stored", job_id)