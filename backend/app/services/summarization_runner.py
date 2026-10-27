# services/summarization_runner.py — the background job behind POST /api/v1/jobs/summarize

import asyncio
from collections.abc import Coroutine
from datetime import UTC, datetime
from typing import Any

import structlog
from pymongo.asynchronous.collection import AsyncCollection

from ..core.background_work import spawn_tracked_task, track_background_work
from ..core.config import settings
from ..core.mongo import get_jobs_collection
from ..schemas.job_api import MANUAL_SOURCE_PREFIX
from ..schemas.job_db import JobErrorCode
from ..schemas.summary import LlmSummaryRequest, LlmSummaryResult, SummaryResponse
from ..schemas.summary_spec import ResolvedLength, SummarySpec, resolve_target_length
from ..services.job_metrics import (
    store_deepeval_metrics_for_job,
    store_source_metrics_for_job,
    store_statistical_metrics_for_job,
)
from ..services.llm import LlmOutputError, generate_summary
from ..services.llm.title import generate_title
from ..services.scraper import extract_text_from_url

log = structlog.get_logger(__name__)


class SourceTooLongError(ValueError):
    code: JobErrorCode = "source_too_long"


@track_background_work("job_metrics")
async def _tracked_metrics(coro: Coroutine[Any, Any, None]) -> None:
    await coro


def spawn_metrics_task(coro: Coroutine[Any, Any, None]) -> None:
    spawn_tracked_task(_tracked_metrics(coro), kind="job_metrics")


@track_background_work("summarization_job")
async def run_summarization_job(job_id: str) -> None:
    jobs_collection = get_jobs_collection()
    job = await jobs_collection.find_one({"job_id": job_id})
    if job is None:
        raise ValueError(f"Job {job_id} not found")

    source_url = job["source_url"]
    model_name = job["model_name"]
    model_provider = job["model_provider"]
    processing_strategy = job["processing_strategy"]
    spec = SummarySpec.model_validate(job["summary_spec"])

    # Bind once here and every log line below this point carries these fields, including
    # ones emitted deep in the scraper, the LLM layer and the metrics writers.
    structlog.contextvars.bind_contextvars(
        job_id=job_id,
        strategy=processing_strategy,
        provider=model_provider,
        model=model_name,
        url=source_url,
    )

    started_at = datetime.now(UTC)

    # Both the visible state and the liveness signal: a job with a fresh heartbeat is owned by a
    # process that is still alive, so nothing else may claim or expire it.
    await jobs_collection.update_one(
        {"job_id": job_id},
        {"$set": {"status": "running", "started_at": started_at, "heartbeat_at": started_at}},
    )

    try:
        source_text = await _load_source_text(job)
        # The scrape is done and the model call is the long part, so this is the one checkpoint
        # a job has to offer.
        await jobs_collection.update_one(
            {"job_id": job_id}, {"$set": {"heartbeat_at": datetime.now(UTC)}}
        )
        spawn_metrics_task(store_source_metrics_for_job(job_id, source_text))

        length = resolve_target_length(
            spec.length, input_words=len(source_text.split()), golden_summary=None
        )
        summary, title = await asyncio.gather(
            generate_summary(
                LlmSummaryRequest(
                    text=source_text,
                    source_url=source_url,
                    model_name=model_name,
                    model_provider=model_provider,
                    language=job["language"],
                    spec=spec,
                    length=length,
                ),
                strategy=processing_strategy,
            ),
            generate_title(source_text, job["language"]),
        )
        await _store_completed_job(jobs_collection, job_id, summary, title, length, started_at)

        spawn_metrics_task(store_statistical_metrics_for_job(job_id, summary.summary, source_text))
        if job["run_deepeval"]:
            spawn_metrics_task(
                store_deepeval_metrics_for_job(
                    job_id, summary.summary, source_text, spec.output_format
                )
            )

    except Exception as exc:
        log.exception(
            "summarization job failed",
            error_type=type(exc).__name__,
            duration_ms=int((datetime.now(UTC) - started_at).total_seconds() * 1000),
        )
        await _store_failed_job(jobs_collection, job_id, exc, started_at)
    finally:
        structlog.contextvars.unbind_contextvars("job_id", "strategy", "provider", "model", "url")


async def _load_source_text(job: dict[str, Any]) -> str:
    log.debug("loading source text")
    source_url = job["source_url"]
    if source_url.startswith(MANUAL_SOURCE_PREFIX):
        source_text = job["input_text"]
    else:
        source_text = (await extract_text_from_url(source_url))["text"]
    # Not truncated: a summary of the first part of an article would pass for the whole.
    if job["origin"] == "public" and len(source_text) > settings.public_max_input_chars:
        raise SourceTooLongError(
            f"source text has {len(source_text)} characters, "
            f"the public limit is {settings.public_max_input_chars}"
        )
    return source_text


async def _store_completed_job(
    jobs_collection: AsyncCollection,
    job_id: str,
    summary: LlmSummaryResult,
    title: str,
    length: ResolvedLength,
    started_at: datetime,
) -> None:
    log.debug("storing completed job")
    finished_at = datetime.now(UTC)
    await jobs_collection.update_one(
        {"job_id": job_id},
        {
            "$set": {
                "status": "completed",
                "summary_data": SummaryResponse.model_validate(
                    {
                        **summary.model_dump(include=set(SummaryResponse.model_fields)),
                        "title": title,
                    }
                ).model_dump(),
                "resolved_length": length.model_dump(),
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


async def _store_failed_job(
    jobs_collection: AsyncCollection, job_id: str, exc: Exception, started_at: datetime
) -> None:
    log.debug("storing failed job")
    finished_at = datetime.now(UTC)
    duration_ms = int((finished_at - started_at).total_seconds() * 1000)
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
                "error_code": exc.code if isinstance(exc, SourceTooLongError) else None,
                "updated_at": finished_at,
            }
        },
    )
