import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from ..core.auth import require_auth
from ..core.config import settings
from ..core.mongo import get_jobs_collection
from ..schemas.schemas import JobCreateRequest, JobListItemResponse, JobStatusResponse
from ..services.llm import generate_summary
from ..services.scraper import extract_text_from_url

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])

logger = logging.getLogger(__name__)


def run_summarization_job(job_id: str, url: str, model_name: str, model_provider: str, language: str) -> None:
    jobs_collection = get_jobs_collection()
    started_at = datetime.now(timezone.utc)

    try:
        logger.debug("[job=%s] started for url=%s", job_id, url)

        text = extract_text_from_url(url)
        summary = generate_summary(text, url, model_name, model_provider, language)

        finished_at = datetime.now(timezone.utc)
        duration_ms = int((finished_at - started_at).total_seconds() * 1000)

        logger.debug(
            "[job=%s] completed text_chars=%s duration_ms=%s",
            job_id, len(text), duration_ms,
        )

        summary_data = {k: v for k, v in summary.items() if k not in ("usage", "raw_metadata")}
        usage = summary.get("usage", {})
        raw_metadata = summary.get("raw_metadata", {})

        jobs_collection.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "source_url": url,
                    "model_provider": model_provider,
                    "model_name": model_name,
                    "status": "completed",
                    "summary_data": summary_data,
                    "usage": usage,
                    "raw_metadata": raw_metadata,
                    "started_at": started_at,
                    "finished_at": finished_at,
                    "duration_ms": duration_ms,
                    "error": None,
                    "updated_at": finished_at,
                }
            },
        )
    except Exception as exc:
        finished_at = datetime.now(timezone.utc)
        duration_ms = int((finished_at - started_at).total_seconds() * 1000)

        logger.exception("[job=%s] failed: %s", job_id, exc)
        jobs_collection.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "source_url": url,
                    "model_provider": model_provider,
                    "model_name": model_name,
                    "status": "failed",
                    "summary_data": None,
                    "usage": {},
                    "raw_metadata": {},
                    "started_at": started_at,
                    "finished_at": finished_at,
                    "duration_ms": duration_ms,
                    "error": str(exc),
                    "updated_at": finished_at,
                }
            },
        )


@router.post("/summarize", summary="Create summarize job", dependencies=[Depends(require_auth)])
async def create_summarize_job(
    payload: JobCreateRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    _verify_model_availability(payload.model_provider, payload.model_name)

    jobs_collection = get_jobs_collection()
    job_id = str(uuid4())

    logger.debug("[job=%s] queued for url=%s", job_id, payload.url)

    now = datetime.now(timezone.utc)
    try:
        jobs_collection.insert_one(
            {
                "job_id": job_id,
                "source_url": payload.url,
                "model_provider": payload.model_provider,
                "model_name": payload.model_name,
                "status": "pending",
                "summary_data": None,
                "usage": {},
                "raw_metadata": {},
                "created_at": now,
                "started_at": None,
                "finished_at": None,
                "duration_ms": 0,
                "error": None,
                "updated_at": now,
            }
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Job already exists") from exc

    background_tasks.add_task(
        run_summarization_job, job_id, payload.url, payload.model_name, payload.model_provider, payload.language
    )
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
    ).sort("created_at", -1).limit(limit)

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


def _verify_model_availability(model_provider: str, model_name: str) -> None:
    if model_provider.lower() not in settings.supported_models.keys():
        raise ValueError(f"Unsupported model provider: {model_provider}")
    if model_name.lower() not in [m.lower() for m in settings.supported_models.get(model_provider.lower(), [])]:
        logger.warning(f"Model name: {model_name} for provider {model_provider} is not supported")
        raise ValueError(f"Unsupported model name: {model_name} for provider {model_provider}")
