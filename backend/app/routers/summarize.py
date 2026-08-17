import asyncio
from collections.abc import Coroutine
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from ..core.auth import require_auth
from ..core.config import settings
from ..core.mongo import get_jobs_collection
from ..schemas.job_api import (
    JobCreatedResponse,
    JobCreateRequest,
    JobDeletedResponse,
    JobListItemResponse,
    JobStatusResponse,
    SummaryMode,
    UrlSummaryListItem,
)
from ..schemas.job_db import JobDocument
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

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])
log = structlog.get_logger(__name__)

# asyncio only weakly references running tasks, so a fire-and-forget create_task can be
# garbage-collected mid-flight and stop silently. Hold a reference until it finishes.
_metrics_tasks: set[asyncio.Task] = set()


def _log_metrics_task_exception(task: asyncio.Task) -> None:
    _metrics_tasks.discard(task)
    if not task.cancelled() and (exc := task.exception()) is not None:
        log.error("metrics task failed", exc_info=exc)


def spawn_metrics_task(coro: Coroutine[Any, Any, None]) -> None:
    task = asyncio.create_task(coro)
    _metrics_tasks.add(task)
    task.add_done_callback(_log_metrics_task_exception)


async def run_summarization_job(
    job_id: str,
    url: str,
    model_name: str,
    model_provider: str,
    language: str,
    summary_mode: SummaryMode,
    run_deepeval: bool,
) -> None:
    # Bind once here and every log line below this point carries job_id and mode, including
    # ones emitted deep in the scraper, the LLM layer and the metrics writers.
    structlog.contextvars.bind_contextvars(job_id=job_id, mode=summary_mode)

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
        log.exception("summarization job failed")

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
                    "duration_ms": int((finished_at - started_at).total_seconds() * 1000),
                    "error": str(exc),
                    "updated_at": finished_at,
                }
            },
        )
    finally:
        structlog.contextvars.unbind_contextvars("job_id", "mode")


@router.post(
    "/summarize",
    response_model=JobCreatedResponse,
    summary="Create summarize job",
    dependencies=[Depends(require_auth)],
)
async def create_summarize_job(
    payload: JobCreateRequest,
    background_tasks: BackgroundTasks,
) -> JobCreatedResponse:
    _verify_model_availability(payload.model_provider, payload.model_name)
    _verify_mode(payload.summary_mode)

    jobs_collection = get_jobs_collection()
    job_id = str(uuid4())
    now = datetime.now(UTC)

    source_url = str(payload.url)
    log.debug("job queued", job_id=job_id, url=source_url, mode=payload.summary_mode)

    document = JobDocument(
        job_id=job_id,
        source_url=source_url,
        model_provider=payload.model_provider,
        model_name=payload.model_name,
        summary_mode=payload.summary_mode,
        status="pending",
        created_at=now,
        updated_at=now,
    )

    try:
        await jobs_collection.insert_one(document.model_dump())
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Job already exists") from exc

    background_tasks.add_task(
        run_summarization_job,
        job_id,
        source_url,
        payload.model_name,
        payload.model_provider,
        payload.language,
        payload.summary_mode,
        payload.run_deepeval,
    )
    return JobCreatedResponse(job_id=job_id)


@router.get(
    "", response_model=list[UrlSummaryListItem], summary="List summarized URLs (grouped, home page)"
)
async def list_summarized_urls(
    limit: int = Query(default=50, ge=1, le=200),
) -> list[UrlSummaryListItem]:
    jobs_collection = get_jobs_collection()
    pipeline = [
        {"$match": {"status": {"$in": ["completed", "failed"]}}},
        {"$sort": {"updated_at": -1}},
        {
            "$group": {
                "_id": "$source_url",
                "completed_count": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
                "failed_count": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}},
                "latest_updated_at": {"$first": "$updated_at"},
                # null for failed jobs, which have no summary_data
                "latest_title": {"$first": {"$ifNull": ["$summary_data.title", ""]}},
            }
        },
        {"$sort": {"latest_updated_at": -1}},
        {"$limit": limit},
    ]
    return [
        UrlSummaryListItem(
            source_url=doc["_id"],
            completed_count=doc["completed_count"],
            failed_count=doc["failed_count"],
            latest_title=doc["latest_title"],
            latest_updated_at=doc["latest_updated_at"],
        )
        async for doc in jobs_collection.aggregate(pipeline)
    ]


@router.get(
    "/list", response_model=list[JobListItemResponse], summary="List all jobs flat (/jobs page)"
)
async def list_all_jobs_flat(
    limit: int = Query(default=100, ge=1, le=500),
) -> list[JobListItemResponse]:
    jobs_collection = get_jobs_collection()
    cursor = (
        jobs_collection.find(
            {},
            {
                "_id": 0,
                "input_text": 0,
                "prompt_template": 0,
                "prompt_params": 0,
                "raw_metadata": 0,
                "summary_data.key_takeaways": 0,
            },
        )
        .sort("updated_at", -1)
        .limit(limit)
    )

    results = []
    async for doc in cursor:
        # summary_data is None until the summary completes (and stays None on failure)
        summary_data = doc["summary_data"]
        results.append(
            JobListItemResponse(
                job_id=doc["job_id"],
                source_url=doc["source_url"],
                status=doc["status"],
                title=summary_data["title"] if summary_data else "",
                summary=summary_data["summary"] if summary_data else "",
                model_provider=doc["model_provider"],
                model_name=doc["model_name"],
                summary_mode=doc["summary_mode"],
                updated_at=doc["updated_at"],
            )
        )
    return results


@router.get("/by-url", response_model=list[JobStatusResponse], summary="Get all jobs for a URL")
async def get_jobs_for_url(
    source_url: str = Query(..., description="Exact source URL"),
    status: str = Query(..., description="One of supported statuses"),
) -> list[JobStatusResponse]:
    jobs_collection = get_jobs_collection()
    cursor = jobs_collection.find({"source_url": source_url, "status": status}, {"_id": 0}).sort(
        "updated_at", -1
    )
    return [JobStatusResponse.model_validate(doc) async for doc in cursor]


@router.get("/{job_id}", response_model=JobStatusResponse, summary="Get job status (polling)")
async def get_job_status(job_id: str) -> JobStatusResponse:
    jobs_collection = get_jobs_collection()
    job_data = await jobs_collection.find_one({"job_id": job_id}, {"_id": 0})
    if not job_data:
        raise HTTPException(status_code=404, detail="Job not found")
    log.debug("job status checked", job_id=job_id, status=job_data["status"])
    return JobStatusResponse.model_validate(job_data)


@router.delete("/{job_id}", response_model=JobDeletedResponse, dependencies=[Depends(require_auth)])
async def delete_job(job_id: str) -> JobDeletedResponse:
    result = await get_jobs_collection().delete_one({"job_id": job_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobDeletedResponse(status="deleted", job_id=job_id)


def _verify_model_availability(model_provider: str, model_name: str) -> None:
    provider = model_provider.lower()
    if provider not in settings.supported_models:
        raise HTTPException(status_code=400, detail=f"Unsupported model provider: {model_provider}")
    if model_name.lower() not in [m.lower() for m in settings.supported_models[provider]]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported model: {model_name} for provider {model_provider}",
        )


def _verify_mode(mode: str) -> None:
    if mode not in settings.supported_summary_modes:
        raise HTTPException(status_code=400, detail=f"Unsupported summary mode: {mode}")
