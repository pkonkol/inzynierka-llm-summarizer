import asyncio
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError
from dataclasses import asdict


from ..core.auth import require_auth
from ..core.config import settings
from ..core.mongo import get_jobs_collection
from ..schemas.schemas import (
    JobCreateRequest,
    JobListItemResponse,
    JobStatusResponse,
    SummaryMode,
    UrlSummaryListItem,
)
from ..services.deepeval_metrics import evaluate_summary_input_metrics, evaluate_summary_metrics, evaluate_summary_takeaways_metrics, evaluate_takeaways_input_metrics, evaluate_takeaways_metrics
from ..services.llm import generate_summary
from ..services.deterministic_metrics import (
    compression_ratio_metrics,
    key_takeaways_metrics,
    source_metrics,
    summary_metrics,
)
from ..services.scraper import extract_text_from_url

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])
logger = logging.getLogger(__name__)

_SUMMARY_TOP_LEVEL_KEYS = {"usage", "raw_metadata", "raw_output", "input_text", "prompt_template", "prompt_params"}


async def _store_metrics(job_id: str, update: dict) -> None:
    try:
        await get_jobs_collection().update_one({"job_id": job_id}, {"$set": update})
    except Exception:
        logger.exception("[job=%s] metrics store failed", job_id)


async def _source_metrics_task(job_id: str, text: str) -> None:
    metrics = await asyncio.to_thread(source_metrics, text)
    await _store_metrics(job_id, {"metrics.source": metrics})
    logger.debug("[job=%s] source metrics stored", job_id)


async def _metrics_task(job_id: str, summary_text: str, takeaways_text: str, source_text: str) -> None:
    sm = await asyncio.to_thread(summary_metrics, summary_text)
    kt = await asyncio.to_thread(key_takeaways_metrics, takeaways_text)
    cr = await asyncio.to_thread(compression_ratio_metrics, source_text, summary_text)
    await _store_metrics(job_id, {
        "metrics.summary": sm,
        "metrics.key_takeaways": kt,
        "metrics.compression": cr,
    })
    logger.debug("[job=%s] summary/takeaways/compression metrics stored", job_id)


async def run_summarization_job(
    job_id: str, url: str, model_name: str, model_provider: str, language: str, summary_mode: SummaryMode, run_deepeval: bool
) -> None:
    jobs_collection = get_jobs_collection()
    started_at = datetime.now(timezone.utc)

    try:
        logger.debug("[job=%s] started url=%s mode=%s", job_id, url, summary_mode)

        data = await extract_text_from_url(url)
        asyncio.create_task(_source_metrics_task(job_id, data["text"]))

        summary = await generate_summary(data, url, model_name, model_provider, language, summary_mode)

        finished_at = datetime.now(timezone.utc)
        duration_ms = int((finished_at - started_at).total_seconds() * 1000)

        summary_data = {k: v for k, v in summary.items() if k not in _SUMMARY_TOP_LEVEL_KEYS}

        await jobs_collection.update_one(
            {"job_id": job_id},
            {"$set": {
                "source_url": url,
                "model_provider": model_provider,
                "model_name": model_name,
                "summary_mode": summary_mode,
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

        short_summary = summary_data.get("short_summary", "")
        takeaways = summary_data.get("key_takeaways", "")
        if short_summary or takeaways:
            asyncio.create_task(_metrics_task(job_id, short_summary, takeaways, data["text"]))
        if run_deepeval and (short_summary or takeaways):
            asyncio.create_task(_deepeval_metrics_task(job_id, short_summary, takeaways, data["text"]))

    except Exception as exc:
        finished_at = datetime.now(timezone.utc)
        duration_ms = int((finished_at - started_at).total_seconds() * 1000)
        raw_output: str = getattr(exc, "raw_output", "")
        logger.exception("[job=%s] failed: %s", job_id, exc)

        await jobs_collection.update_one(
            {"job_id": job_id},
            {"$set": {
                "source_url": url,
                "model_provider": model_provider,
                "model_name": model_name,
                "summary_mode": summary_mode,
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
    _verify_mode(payload.summary_mode)

    jobs_collection = get_jobs_collection()
    job_id = str(uuid4())
    now = datetime.now(timezone.utc)

    logger.debug("[job=%s] queued url=%s mode=%s", job_id, payload.url, payload.summary_mode)

    try:
        await jobs_collection.insert_one({
            "job_id": job_id,
            "source_url": payload.url,
            "model_provider": payload.model_provider,
            "model_name": payload.model_name,
            "summary_mode": payload.summary_mode,
            "status": "pending",
            "summary_data": None,
            "metrics": {"source": {}, "summary": {}, "key_takeaways": {}, "compression": {}},
            "deepeval_metrics": {"summary": [], "summary_input": [], "takeaways": [], "takeaways_input": [], "summary_takeaways": []},
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
        run_summarization_job,
        job_id, payload.url, payload.model_name, payload.model_provider, payload.language, payload.summary_mode, payload.run_deepeval,
    )
    return {"job_id": job_id}


@router.get("", response_model=list[UrlSummaryListItem], summary="List summarized URLs (grouped, home page)")
async def list_summarized_urls(
    limit: int = Query(default=50, ge=1, le=200),
) -> list[UrlSummaryListItem]:
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
        async for doc in jobs_collection.aggregate(pipeline)
    ]
    return results


@router.get("/list", response_model=list[JobListItemResponse], summary="List all jobs flat (/jobs page)")
async def list_all_jobs_flat(
    limit: int = Query(default=100, ge=1, le=500),
) -> list[JobListItemResponse]:
    jobs_collection = get_jobs_collection()
    cursor = jobs_collection.find(
        {},
        {"_id": 0, "input_text": 0, "prompt_template": 0, "prompt_params": 0, "raw_metadata": 0, "summary_data.key_takeaways": 0},
    ).sort("updated_at", -1).limit(limit)

    results = []
    async for doc in cursor:
        sd = doc.get("summary_data") or {}
        results.append(JobListItemResponse(
            job_id=str(doc.get("job_id", "")),
            source_url=str(doc.get("source_url", "")),
            status=doc.get("status", "pending"),
            title=str(sd.get("title", "")),
            short_summary=str(sd.get("short_summary", "")),
            model_provider=str(doc.get("model_provider", "")),
            model_name=str(doc.get("model_name", "")),
            summary_mode=doc.get("summary_mode") or "simple",
            updated_at=doc.get("updated_at"),
        ))
    return results


@router.get("/by-url", response_model=list[JobStatusResponse], summary="Get all jobs for a URL")
async def get_jobs_for_url(
    source_url: str = Query(..., description="Exact source URL"),
    status: str = Query(..., description="One of supported statuses"),
) -> list[JobStatusResponse]:
    jobs_collection = get_jobs_collection()
    cursor = jobs_collection.find({"source_url": source_url, "status": status}, {"_id": 0}).sort("updated_at", -1)
    return [JobStatusResponse.model_validate(doc) async for doc in cursor]


@router.get("/{job_id}", response_model=JobStatusResponse, summary="Get job status (polling)")
async def get_job_status(job_id: str) -> JobStatusResponse:
    jobs_collection = get_jobs_collection()
    job_data = await jobs_collection.find_one({"job_id": job_id}, {"_id": 0})
    if not job_data:
        raise HTTPException(status_code=404, detail="Job not found")
    logger.debug("[job=%s] status check -> %s", job_id, job_data.get("status"))
    return JobStatusResponse.model_validate(job_data)


def _verify_model_availability(model_provider: str, model_name: str) -> None:
    if model_provider.lower() not in settings.supported_models:
        raise ValueError(f"Unsupported model provider: {model_provider}")
    if model_name.lower() not in [m.lower() for m in settings.supported_models.get(model_provider.lower(), [])]:
        raise ValueError(f"Unsupported model: {model_name} for provider {model_provider}")


def _verify_mode(mode: str) -> None:
    if mode not in settings.supported_summary_modes:
        raise ValueError(f"Unsupported summary mode: {mode}")


async def _deepeval_metrics_task(job_id: str, summary_text: str, takeaways_text: str, source_text: str) -> None:
    summary_results = await evaluate_summary_metrics(settings, summary_text) if summary_text else []
    summary_input_results = await evaluate_summary_input_metrics(
        settings, source_text, summary_text) if summary_text and source_text else []
    takeaways_results = await evaluate_takeaways_metrics(settings, takeaways_text) if takeaways_text else []
    takeaways_input_results = await evaluate_takeaways_input_metrics(
        settings, source_text, takeaways_text) if takeaways_text and source_text else []
    summary_takeaways_results = await evaluate_summary_takeaways_metrics(
        settings, source_text, summary_text, takeaways_text) if summary_text and takeaways_text and source_text else []
    from pprint import pprint
    pprint(summary_results)
    pprint(summary_input_results)
    pprint(takeaways_results)
    pprint(takeaways_input_results)
    pprint(summary_takeaways_results)

    # print(dir(summary_results))
    # print(summary_results[0])
    # print(dir(summary_results[0]))
    # print(asdict(summary_results[0]))

    await _store_metrics(job_id, {
        "deepeval_metrics.summary": [asdict(x) for x in summary_results],
        "deepeval_metrics.summary_input": [asdict(x) for x in summary_input_results],
        "deepeval_metrics.takeaways": [asdict(x) for x in takeaways_results],
        "deepeval_metrics.takeaways_input": [asdict(x) for x in takeaways_input_results],
        "deepeval_metrics.summary_takeaways": [asdict(x) for x in summary_takeaways_results],
    })