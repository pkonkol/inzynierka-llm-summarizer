from datetime import UTC, datetime
from typing import Annotated
from uuid import uuid4

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from ..core.auth import require_auth
from ..core.mongo import get_jobs_collection
from ..schemas.job_api import (
    JobCreatedResponse,
    JobCreateRequest,
    JobDeletedResponse,
    JobListItemResponse,
    JobStatusResponse,
    JobStatusValue,
    UrlSummaryListItem,
)
from ..schemas.job_db import JobDocument
from ..services.llm._base import validate_model, validate_processing_strategy
from ..services.summarization_runner import run_summarization_job

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])
log = structlog.get_logger(__name__)


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
    try:
        validate_model(payload.model_provider, payload.model_name)
        validate_processing_strategy(payload.processing_strategy)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    jobs_collection = get_jobs_collection()
    job_id = str(uuid4())
    now = datetime.now(UTC)

    source_url, input_text = payload.source_url_and_text()

    log.debug("job queued", job_id=job_id, url=source_url, strategy=payload.processing_strategy)

    document = JobDocument(
        job_id=job_id,
        source_url=source_url,
        model_provider=payload.model_provider,
        model_name=payload.model_name,
        processing_strategy=payload.processing_strategy,
        summary_spec=payload.summary_spec,
        language=payload.language,
        run_deepeval=payload.run_deepeval,
        status="pending",
        input_text=input_text,
        created_at=now,
        heartbeat_at=now,
        updated_at=now,
    )

    try:
        await jobs_collection.insert_one(document.model_dump())
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Job already exists") from exc

    background_tasks.add_task(run_summarization_job, job_id)
    return JobCreatedResponse(job_id=job_id)


@router.get(
    "", response_model=list[UrlSummaryListItem], summary="List summarized URLs (grouped, home page)"
)
async def list_summarized_urls(
    limit: int = Query(default=50, ge=1, le=200),
) -> list[UrlSummaryListItem]:
    jobs_collection = get_jobs_collection()
    pipeline = [
        {"$match": {"status": {"$in": ["completed", "failed", "pending", "running"]}}},
        {"$sort": {"updated_at": -1}},
        {
            "$group": {
                "_id": "$source_url",
                "completed_count": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
                "failed_count": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}},
                "pending_count": {
                    "$sum": {"$cond": [{"$in": ["$status", ["pending", "running"]]}, 1, 0]}
                },
                "latest_updated_at": {"$first": "$updated_at"},
                # $$REMOVE drops the element, so only completed jobs contribute a title and a
                # pending or failed job at the top of the sort cannot blank out the URL's label.
                "completed_titles": {
                    "$push": {
                        "$cond": [
                            {"$eq": ["$status", "completed"]},
                            {"$ifNull": ["$summary_data.title", ""]},
                            "$$REMOVE",
                        ]
                    }
                },
            }
        },
        {"$addFields": {"latest_title": {"$ifNull": [{"$first": "$completed_titles"}, ""]}}},
        {"$sort": {"latest_updated_at": -1}},
        {"$limit": limit},
    ]
    return [
        UrlSummaryListItem(
            source_url=doc["_id"],
            completed_count=doc["completed_count"],
            failed_count=doc["failed_count"],
            pending_count=doc["pending_count"],
            latest_title=doc["latest_title"],
            latest_updated_at=doc["latest_updated_at"],
        )
        async for doc in jobs_collection.aggregate(pipeline)
    ]


@router.get(
    "/list", response_model=list[JobListItemResponse], summary="List all jobs flat (/jobs page)"
)
async def list_all_jobs_flat(
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    status: Annotated[list[JobStatusValue] | None, Query()] = None,
) -> list[JobListItemResponse]:
    jobs_collection = get_jobs_collection()
    cursor = (
        jobs_collection.find(
            {"status": {"$in": status}} if status else {},
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
                summary=(summary_data["summary"] or "") if summary_data else "",
                model_provider=doc["model_provider"],
                model_name=doc["model_name"],
                processing_strategy=doc["processing_strategy"],
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
    cursor = jobs_collection.find(
        {"source_url": source_url, "status": status},
        {"_id": 0, "input_text": 0, "prompt_params": 0, "raw_output": 0, "raw_metadata": 0},
    ).sort("updated_at", -1)
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
