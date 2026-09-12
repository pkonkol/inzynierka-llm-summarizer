# services/summarization_runner.py — the background job behind POST /api/v1/jobs/summarize

from collections.abc import Coroutine
from datetime import UTC, datetime
from typing import Any

import structlog

from ..core.background_work import spawn_tracked_task, track_background_work
from ..core.mongo import get_jobs_collection
from ..schemas.job_api import MANUAL_SOURCE_PREFIX
from ..schemas.summary import SummaryResponse
from ..schemas.summary_spec import ExplicitLength, SummarySpec, resolve_target_length
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
    language = job["language"]
    processing_strategy = job["processing_strategy"]
    spec = SummarySpec.model_validate(job["summary_spec"])
    run_deepeval = job["run_deepeval"]

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
        if source_url.startswith(MANUAL_SOURCE_PREFIX):
            data = {
                "text": job["input_text"],
                "title": source_url.removeprefix(MANUAL_SOURCE_PREFIX),
            }
        else:
            data = await extract_text_from_url(source_url)
        # The scrape is done and the model call is the long part, so this is the one checkpoint
        # a job has to offer.
        await jobs_collection.update_one(
            {"job_id": job_id}, {"$set": {"heartbeat_at": datetime.now(UTC)}}
        )
        spawn_metrics_task(store_source_metrics_for_job(job_id, data["text"]))

        input_words = len(data["text"].split())
        target_words, target_sentences = resolve_target_length(
            spec.length, input_words=input_words, golden_summary=None
        )
        resolved_spec = spec.model_copy(
            update={
                "length": ExplicitLength(
                    target_words=target_words, target_sentences=target_sentences
                )
            }
        )

        summary = await generate_summary(
            data,
            source_url,
            model_name,
            model_provider,
            language,
            resolved_spec,
            strategy=processing_strategy,
        )

        finished_at = datetime.now(UTC)
        takeaways_text = join_takeaways(summary.key_takeaways)
        summary_text = summary.summary if summary.summary is not None else ""

        await jobs_collection.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "status": "completed",
                    "summary_data": SummaryResponse(
                        title=summary.title,
                        summary=summary.summary,
                        key_takeaways=summary.key_takeaways,
                        output_format=summary.output_format,
                        source_url=summary.source_url,
                    ).model_dump(),
                    "resolved_length": {
                        "target_words": target_words,
                        "target_sentences": target_sentences,
                    },
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

        if summary_text or takeaways_text:
            spawn_metrics_task(
                store_statistical_metrics_for_job(
                    job_id, summary_text, takeaways_text, data["text"]
                )
            )
        if run_deepeval and (summary_text or takeaways_text):
            spawn_metrics_task(
                store_deepeval_metrics_for_job(job_id, summary_text, takeaways_text, data["text"])
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
        structlog.contextvars.unbind_contextvars("job_id", "strategy", "provider", "model", "url")
