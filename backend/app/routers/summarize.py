import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from ..core.mongo import get_jobs_collection
from ..schemas.schemas import JobCreateRequest, JobListItemResponse, JobStatusResponse
from ..services.llm import generate_summary
from ..services.scraper import extract_text_from_url

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])

logger = logging.getLogger(__name__)


def run_summarization_job(job_id: str, url: str) -> None:
    jobs_collection = get_jobs_collection()

    try:
        logger.debug("[job=%s] started for url=%s", job_id, url)

        text = extract_text_from_url(url)
        summary = generate_summary(text, source_url=url)

        logger.debug(
            "[job=%s] completed text_chars=%s summary_keys=%s",
            job_id,
            len(text),
            sorted(summary.keys()),
        )

        jobs_collection.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "source_url": url,
                    "status": "completed",
                    "summary_data": summary,
                    "error": None,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
    except Exception as exc:
        logger.exception("[job=%s] failed: %s", job_id, exc)
        jobs_collection.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "source_url": url,
                    "status": "failed",
                    "summary_data": None,
                    "error": str(exc),
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )


@router.post("/summarize", summary="Create summarize job")
async def create_summarize_job(
    payload: JobCreateRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    jobs_collection = get_jobs_collection()
    job_id = str(uuid4())

    logger.debug("[job=%s] queued for url=%s", job_id, payload.url)

    now = datetime.now(timezone.utc)
    try:
        jobs_collection.insert_one(
            {
                "job_id": job_id,
                "source_url": payload.url,
                "status": "pending",
                "summary_data": None,
                "error": None,
                "created_at": now,
                "updated_at": now,
            }
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Job already exists") from exc

    background_tasks.add_task(run_summarization_job, job_id, payload.url)
    return {"job_id": job_id}


@router.get("", response_model=list[JobListItemResponse], summary="List completed jobs")
async def list_completed_jobs(
    limit: int = Query(default=50, ge=1, le=200),
) -> list[JobListItemResponse]:
    jobs_collection = get_jobs_collection()
    cursor = jobs_collection.find(
        {"status": "completed"},
        {
            "_id": 0,
            "job_id": 1,
            "source_url": 1,
            "summary_data.title": 1,
        },
    ).sort("updated_at", -1).limit(limit)

    items: list[JobListItemResponse] = []
    for doc in cursor:
        summary_data = doc.get("summary_data") or {}
        items.append(
            JobListItemResponse(
                job_id=str(doc.get("job_id", "")),
                source_url=str(doc.get("source_url", "")),
                title=str(summary_data.get("title", "")),
            )
        )

    logger.debug("listed completed jobs count=%s", len(items))
    return items


@router.get("/{job_id}", response_model=JobStatusResponse, summary="Get job status")
async def get_job_status(job_id: str) -> JobStatusResponse:
    jobs_collection = get_jobs_collection()
    job_data = jobs_collection.find_one({"job_id": job_id}, {"_id": 0})
    if not job_data:
        raise HTTPException(status_code=404, detail="Job not found")

    logger.debug("[job=%s] status check -> %s", job_id, job_data.get("status"))

    return JobStatusResponse.model_validate(job_data)
