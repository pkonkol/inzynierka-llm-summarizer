# services/summarization_runner.py — the background job behind POST /api/v1/jobs/summarize

import asyncio
from collections.abc import Coroutine
from datetime import UTC, datetime
from typing import Any

import structlog

from ..core.background_work import track_background_work
from ..core.mongo import get_jobs_collection
from ..schemas.job_api import SummaryMode
from ..schemas.summary import SummaryResponse
from ..services.llm import generate_summary
from ..services.llm._base import LlmOutputError
from ..services.run_metrics import (
    join_takeaways,
    store_deepeval_metrics_for_job,
    store_source_metrics_for_job,
    store_statistical_metrics_for_job,
)
from ..services.scraper import extract_text_from_url

log = structlog.get_logger(__name__)


# asyncio only weakly references running tasks, so a fire-and-forget create_task can be
# garbage-collected mid-flight and stop silently. Hold a reference until it finishes.
_metrics_tasks: set[asyncio.Task] = set()


def _log_metrics_task_exception(task: asyncio.Task) -> None:
    _metrics_tasks.discard(task)
    if not task.cancelled() and (exc := task.exception()) is not None:
        log.error("metrics task failed", exc_info=exc)


@track_background_work("job_metrics")
async def _tracked_metrics(coro: Coroutine[Any, Any, None]) -> None:
    await coro


def spawn_metrics_task(coro: Coroutine[Any, Any, None]) -> None:
    task = asyncio.create_task(_tracked_metrics(coro))
    _metrics_tasks.add(task)
    task.add_done_callback(_log_metrics_task_exception)


@track_background_work("summarization_job")
async def run_summarization_job(
    job_id: str,
    url: str,
    model_name: str,
    model_provider: str,
    language: str,
    summary_mode: SummaryMode,
    run_deepeval: bool,
) -> None:
    # Bind once here and every log line below this point carries these fields, including
    # ones emitted deep in the scraper, the LLM layer and the metrics writers.
    structlog.contextvars.bind_contextvars(
        job_id=job_id,
        mode=summary_mode,
        provider=model_provider,
        model=model_name,
        url=url,
    )

    jobs_collection = get_jobs_collection()
    started_at = datetime.now(UTC)

    try:
        data = await extract_text_from_url(url)
        spawn_metrics_task(store_source_metrics_for_job(job_id, data["text"]))

        summary = await generate_summary(
            data, url, model_name, model_provider, language, summary_mode
        )

        finished_at = datetime.now(UTC)
        takeaways_text = join_takeaways(summary.key_takeaways)

        await jobs_collection.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "status": "completed",
                    "summary_data": SummaryResponse(
                        title=summary.title,
                        summary=summary.summary,
                        key_takeaways=summary.key_takeaways,
                        source_url=summary.source_url,
                    ).model_dump(),
                    "usage": summary.usage.model_dump(),
                    "raw_metadata": summary.raw_metadata,
                    "raw_output": summary.raw_output,
                    "input_text": summary.input_text,
                    "prompt_template": summary.prompt_template,
                    "prompt_params": summary.prompt_params,
                    "started_at": started_at,
                    "finished_at": finished_at,
                    "duration_ms": int((finished_at - started_at).total_seconds() * 1000),
                    "error": None,
                    "updated_at": finished_at,
                }
            },
        )

        if summary.summary or takeaways_text:
            spawn_metrics_task(
                store_statistical_metrics_for_job(
                    job_id, summary.summary, takeaways_text, data["text"]
                )
            )
        if run_deepeval and (summary.summary or takeaways_text):
            spawn_metrics_task(
                store_deepeval_metrics_for_job(
                    job_id, summary.summary, takeaways_text, data["text"]
                )
            )

    except Exception as exc:
        finished_at = datetime.now(UTC)
        duration_ms = int((finished_at - started_at).total_seconds() * 1000)
        log.exception(
            "summarization job failed",
            error_type=type(exc).__name__,
            duration_ms=duration_ms,
        )

        await jobs_collection.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "status": "failed",
                    "summary_data": None,
                    # only an LLM parse failure carries the model's raw text
                    "raw_output": exc.raw_output if isinstance(exc, LlmOutputError) else "",
                    "started_at": started_at,
                    "finished_at": finished_at,
                    "duration_ms": duration_ms,
                    "error": str(exc),
                    "updated_at": finished_at,
                }
            },
        )
    finally:
        structlog.contextvars.unbind_contextvars("job_id", "mode", "provider", "model", "url")
