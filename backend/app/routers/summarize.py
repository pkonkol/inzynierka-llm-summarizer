import logging
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException

from ..schemas.schemas import JobCreateRequest, JobStatusResponse
from ..core.config import settings
from ..services.llm import generate_summary
from ..services.scraper import extract_text_from_url

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])

JOB_STORE: dict[str, dict] = {}
logger = logging.getLogger(__name__)


def run_summarization_job(job_id: str, url: str) -> None:
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

        JOB_STORE[job_id] = {
            "job_id": job_id,
            "source_url": url,
            "status": "completed",
            "summary_data": summary,
        }
    except Exception as exc:
        logger.exception("[job=%s] failed: %s", job_id, exc)
        JOB_STORE[job_id] = {
            "job_id": job_id,
            "source_url": url,
            "status": "failed",
            "summary_data": None,
            "error": str(exc),
        }


@router.post("/summarize", summary="Create summarize job")
async def create_summarize_job(
    payload: JobCreateRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    job_id = str(uuid4())

    logger.debug("[job=%s] queued for url=%s", job_id, payload.url)

    JOB_STORE[job_id] = {
        "job_id": job_id,
        "source_url": payload.url,
        "status": "pending",
        "summary_data": None,
    }
    background_tasks.add_task(run_summarization_job, job_id, payload.url)
    return {"job_id": job_id}


@router.get("/{job_id}", response_model=JobStatusResponse, summary="Get job status")
async def get_job_status(job_id: str) -> JobStatusResponse:
    job_data = JOB_STORE.get(job_id)
    if not job_data:
        raise HTTPException(status_code=404, detail="Job not found")

    logger.debug("[job=%s] status check -> %s", job_id, job_data.get("status"))

    return JobStatusResponse.model_validate(job_data)
