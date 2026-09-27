import structlog

from ..core.executors import run_blocking
from ..core.mongo import get_jobs_collection
from ..schemas.summary_spec import OutputFormat
from .metrics import compute_deepeval_metrics, compute_statistical_metrics
from .metrics.statistical import source_metrics

log = structlog.get_logger(__name__)


async def store_job_metrics(job_id: str, update: dict) -> None:
    try:
        await get_jobs_collection().update_one({"job_id": job_id}, {"$set": update})
    except Exception:
        log.exception("metrics store failed")


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
