from typing import Self

import structlog
from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import Field, model_validator

from ..core.config import settings
from ..core.rate_limit import enforce_public_rate_limit
from ..schemas.job_api import JobCreatedResponse, SummarizeSourceRequest
from .summarize import queue_summarization_job

router = APIRouter(prefix="/api/v1/public", tags=["public"])
log = structlog.get_logger(__name__)

# Half of the 10k words the longest supported article is sized against (~6 characters a word).
_MAX_PUBLIC_CHARS = 30_000


class PublicSummarizeRequest(SummarizeSourceRequest):
    input_text: str | None = Field(default=None, min_length=1, max_length=_MAX_PUBLIC_CHARS)
    language: str = "auto"

    @model_validator(mode="after")
    def _reject_free_text_instructions(self) -> Self:
        # The visitor never sees this field, and free text from an anonymous caller lands
        # verbatim in the prompt.
        if self.summary_spec.extra_instructions is not None:
            raise ValueError("extra_instructions is not available on the public endpoint")
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
    await enforce_public_rate_limit(request)

    return await queue_summarization_job(
        payload,
        background_tasks,
        model_provider=settings.public_summary_model["model_provider"],
        model_name=settings.public_summary_model["model_name"],
        language=payload.language,
        processing_strategy="direct",
        run_deepeval=False,
        origin="public",
    )
