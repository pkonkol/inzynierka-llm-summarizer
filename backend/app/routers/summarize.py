import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from ..core.auth import require_auth
from ..core.config import settings
from ..core.mongo import get_jobs_collection
from ..schemas.schemas import (
    JobCreateRequest,
    JobListItemResponse,
    JobStatusResponse,
    UrlSummaryListItem,
)
from ..services.llm import generate_summary
from ..services.scraper import extract_text_from_url

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])

logger = logging.getLogger(__name__)

_LIST_PROJECTION = {
    "_id": 0,
    "input_text": 0,
    "prompt_template": 0,
    "prompt_params": 0,
}

# Keys from generate_summary() that are stored as dedicated top-level job fields
_SUMMARY_TOP_LEVEL_KEYS = {"usage", "raw_metadata", "raw_output", "input_text", "prompt_template", "prompt_params"}


def run_summarization_job(job_id: str, url: str, model_name: str, model_provider: str, language: str) -> None:
    jobs_collection = get_jobs_collection()
    started_at = datetime.now(timezone.utc)

    try:
        logger.debug("[job=%s] started for url=%s", job_id, url)

        text = extract_text_from_url(url)
        summary = generate_summary(text, url, model_name, model_provider, language)

        finished_at = datetime.now(timezone.utc)
        duration_ms = int((finished_at - started_at).total_seconds() * 1000)

        logger.debug("[job=%s] completed text_chars=%s duration_ms=%s", job_id, len(text), duration_ms)

        summary_data = {k: v for k, v in summary.items() if k not in _SUMMARY_TOP_LEVEL_KEYS}

        jobs_collection.update_one(
            {"job_id": job_id},
            {"$set": {
                "source_url": url,
                "model_provider": model_provider,
                "model_name": model_name,
                "status": "completed",
                "summary_data": summary_data,
                "usage": summary.get("usage", {}),
                "raw_metadata": summary.get("raw_metadata", {}),
                "raw_output": summary.get("raw_output", ""),
                "input_text": summary.get("input_text", ""),
                "prompt_template": summary.get("prompt_template", []),
                "prompt_params": summary.get("prompt_params", {}),
                "started_at": started_at,
                "finished_at": finished_at,
                "duration_ms": duration_ms,
                "error": None,
                "updated_at": finished_at,
            }},
        )
    except Exception as exc:
        finished_at = datetime.now(timezone.utc)
        duration_ms = int((finished_at - started_at).total_seconds() * 1000)

        raw_output: str = getattr(exc, "raw_output", "")
        logger.exception("[job=%s] failed: %s", job_id, exc)

        jobs_collection.update_one(
            {"job_id": job_id},
            {"$set": {
                "source_url": url,
                "model_provider": model_provider,
                "model_name": model_name,
                "status": "failed",
                "summary_data": None,
                "usage": {},
                "raw_metadata": {},
                "raw_output": raw_output,
                "input_text": "",
                "prompt_template": [],
                "prompt_params": {},
                "started_at": started_at,
                "finished_at": finished_at,
                "duration_ms": duration_ms,
                "error": str(exc),
                "updated_at": finished_at,
            }},
        )


@router.post("/summarize", summary="Create summarize job", dependencies=[Depends(require_auth)])
async def create_summarize_job(
    payload: JobCreateRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    _verify_model_availability(payload.model_provider, payload.model_name)

    jobs_collection = get_jobs_collection()
    job_id = str(uuid4())
    now = datetime.now(timezone.utc)

    logger.debug("[job=%s] queued for url=%s", job_id, payload.url)

    try:
        jobs_collection.insert_one({
            "job_id": job_id,
            "source_url": payload.url,
            "model_provider": payload.model_provider,
            "model_name": payload.model_name,
            "status": "pending",
            "summary_data": None,
            "usage": {},
            "raw_metadata": {},
            "raw_output": "",
            "input_text": "",
            "prompt_template": [],
            "prompt_params": {},
            "created_at": now,
            "started_at": None,
            "finished_at": None,
            "duration_ms": 0,
            "error": None,
            "updated_at": now,
        })
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Job already exists") from exc

    background_tasks.add_task(
        run_summarization_job, job_id, payload.url, payload.model_name, payload.model_provider, payload.language
    )
    return {"job_id": job_id}


@router.get("", response_model=list[UrlSummaryListItem], summary="List summarized URLs (grouped, home page)")
async def list_summarized_urls(
    limit: int = Query(default=50, ge=1, le=200),
) -> list[UrlSummaryListItem]:
    """One entry per unique source_url, sorted by most-recently updated."""
    jobs_collection = get_jobs_collection()

    pipeline = [
        {"$match": {"status": {"$in": ["completed", "failed"]}}},
        {"$sort": {"updated_at": -1}},
        {"$group": {
            "_id": "$source_url",
            "completed_count": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "failed_count": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}},
            "latest_updated_at": {"$first": "$updated_at"},
            "latest_title": {"$first": "$summary_data.title"},
        }},
        {"$sort": {"latest_updated_at": -1}},
        {"$limit": limit},
    ]

    results = [
        UrlSummaryListItem(
            source_url=doc["_id"],
            completed_count=doc["completed_count"],
            failed_count=doc["failed_count"],
            latest_title=doc.get("latest_title") or "",
            latest_updated_at=doc.get("latest_updated_at"),
        )
        for doc in jobs_collection.aggregate(pipeline)
    ]
    logger.debug("list_summarized_urls returned %s unique URLs", len(results))
    return results


@router.get("/list", response_model=list[JobListItemResponse], summary="List all jobs flat (debug /jobs page)")
async def list_all_jobs_flat(
    limit: int = Query(default=100, ge=1, le=500),
) -> list[JobListItemResponse]:
    """Flat list of all jobs across all statuses, sorted newest first. Used by the /jobs debug page."""
    jobs_collection = get_jobs_collection()
    cursor = jobs_collection.find(
        {},
        {
            "_id": 0,
            "input_text": 0,
            "prompt_template": 0,
            "prompt_params": 0,
            "raw_metadata": 0,
            "summary_data.key_takeaways": 0,
        },
    ).sort("updated_at", -1).limit(limit)

    results = []
    for doc in cursor:
        sd = doc.get("summary_data") or {}
        results.append(JobListItemResponse(
            job_id=str(doc.get("job_id", "")),
            source_url=str(doc.get("source_url", "")),
            status=doc.get("status", "pending"),
            title=str(sd.get("title", "")),
            short_summary=str(sd.get("short_summary", "")),
            model_provider=str(doc.get("model_provider", "")),
            model_name=str(doc.get("model_name", "")),
            updated_at=doc.get("updated_at"),
        ))
    logger.debug("list_all_jobs_flat returned %s jobs", len(results))
    return results


@router.get("/by-url", response_model=list[JobStatusResponse], summary="Get all jobs for a URL")
async def get_jobs_for_url(
    source_url: str = Query(..., description="Exact source URL"),
) -> list[JobStatusResponse]:
    """All jobs for the given source_url, newest first (all statuses)."""
    jobs_collection = get_jobs_collection()
    cursor = jobs_collection.find({"source_url": source_url}, {"_id": 0}).sort("updated_at", -1)
    jobs = [JobStatusResponse.model_validate(doc) for doc in cursor]
    logger.debug("get_jobs_for_url url=%s returned %s jobs", source_url, len(jobs))
    return jobs


@router.get("/{job_id}", response_model=JobStatusResponse, summary="Get job status (polling)")
async def get_job_status(job_id: str) -> JobStatusResponse:
    jobs_collection = get_jobs_collection()
    job_data = jobs_collection.find_one({"job_id": job_id}, {"_id": 0})
    if not job_data:
        raise HTTPException(status_code=404, detail="Job not found")
    logger.debug("[job=%s] status check -> %s", job_id, job_data.get("status"))
    return JobStatusResponse.model_validate(job_data)


def _verify_model_availability(model_provider: str, model_name: str) -> None:
    if model_provider.lower() not in settings.supported_models:
        raise ValueError(f"Unsupported model provider: {model_provider}")
    if model_name.lower() not in [m.lower() for m in settings.supported_models.get(model_provider.lower(), [])]:
        logger.warning("Model %s for provider %s not in supported list", model_name, model_provider)
        logger.warning("Supported: %s", settings.supported_models.get(model_provider.lower(), []))
        raise ValueError(f"Unsupported model name: {model_name} for provider {model_provider}")
