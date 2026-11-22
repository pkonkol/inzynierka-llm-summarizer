from typing import Self

import structlog
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import Field, model_validator

from ..core.config import settings
from ..core.mongo import get_jobs_collection
from ..core.rate_limit import enforce_public_rate_limit, enforce_public_web_search_limit
from ..schemas.job_api import JobCreatedResponse, SummarizeSourceRequest
from ..services.fact_check_runner import FactCheckNotAllowedError, start_fact_check
from .summarize import queue_summarization_job

router = APIRouter(prefix="/api/v1/public", tags=["public"])
log = structlog.get_logger(__name__)


class PublicSummarizeRequest(SummarizeSourceRequest):
    input_text: str | None = Field(
        default=None, min_length=1, max_length=settings.public_max_input_chars
    )
    language: str = "auto"
    add_web_context: bool = False

    @model_validator(mode="after")
    def _reject_free_text_instructions(self) -> Self:
        # The visitor never sees this field, and free text from an anonymous caller lands
        # verbatim in the prompt.
        if self.summary_spec.extra_instructions is not None:
            raise ValueError("extra_instructions is not available on the public endpoint")
        return self

    @model_validator(mode="after")
    def _reject_context_section(self) -> Self:
        if self.summary_spec.context_section is not None:
            raise ValueError("context_section is only available in the admin console for now")
        return self

    @model_validator(mode="after")
    def _require_supported_language(self) -> Self:
        # The value is interpolated into the prompt, so it must be one we chose.
        if self.language not in settings.supported_summary_languages:
            raise ValueError(f"language must be one of {settings.supported_summary_languages}")
        return self


@router.post(
    "/summarize",
    response_model=JobCreatedResponse,
    summary="Create a summarize job without logging in (rate limited)",
)
async def create_public_summarize_job(
    payload: PublicSummarizeRequest,
    background_tasks: BackgroundTasks,
    request: Request,
) -> JobCreatedResponse:
    # Inside the handler so a request the body validation rejects does not spend the caller's quota.
    await enforce_public_rate_limit(request, "summarize")
    if payload.add_web_context:
        await enforce_public_web_search_limit()

    return await queue_summarization_job(
        payload,
        background_tasks,
        model_provider=settings.public_summary_model["model_provider"],
        model_name=settings.public_summary_model["model_name"],
        language=payload.language,
        processing_strategy="direct",
        run_deepeval=False,
        origin="public",
        context_expansion_mode="staged" if payload.add_web_context else "none",
    )


@router.post(
    "/jobs/{job_id}/fact-check",
    status_code=202,
    summary="Start a fact check of a completed public summary (daily limit)",
    responses={404: {"description": "No public job"}, 409: {"description": "Not startable now"}},
)
async def request_public_fact_check(job_id: str, request: Request) -> None:
    log.debug("public fact check requested", job_id=job_id)
    job = await get_jobs_collection().find_one({"job_id": job_id, "origin": "public"}, {"_id": 1})
    if job is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono podsumowania.")

    await enforce_public_rate_limit(request, "fact_check")
    await enforce_public_web_search_limit()
    try:
        await start_fact_check(job_id)
    except FactCheckNotAllowedError as exc:
        raise HTTPException(
            status_code=409,
            detail="Fakty tego podsumowania są już sprawdzane albo sprawdzone.",
        ) from exc
