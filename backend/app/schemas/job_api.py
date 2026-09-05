# schemas/job_api.py — request/response shapes for /api/v1/jobs

from datetime import datetime
from typing import Any, Literal

from pydantic import HttpUrl

from .base import ApiModel
from .job_db import JobMetrics
from .shared_metrics import DeepevalItem
from .summary import SummaryResponse, UsageMetadata

SummaryMode = Literal["simple", "sequential", "cascade"]
JobStatusValue = Literal["pending", "completed", "failed"]


class JobCreateRequest(ApiModel):
    model_name: str
    model_provider: str
    url: HttpUrl
    language: str = "en"
    summary_mode: SummaryMode = "simple"
    run_deepeval: bool = False


class JobStatusResponse(ApiModel):
    job_id: str
    source_url: str
    status: JobStatusValue
    model_provider: str
    model_name: str
    summary_mode: SummaryMode
    summary_data: SummaryResponse | None = None
    metrics: JobMetrics
    deepeval_metrics: list[DeepevalItem]
    usage: UsageMetadata
    raw_metadata: dict[str, Any]
    raw_output: str
    input_text: str
    prompt_template: list[tuple[str, str]]
    prompt_params: dict[str, str]
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: int
    error: str | None = None


class JobListItemResponse(ApiModel):
    """Flat per-job entry used by GET /api/v1/jobs/list."""

    job_id: str
    source_url: str
    status: JobStatusValue
    title: str  # empty until the summary completes
    summary: str
    model_provider: str
    model_name: str
    summary_mode: SummaryMode
    updated_at: datetime


class UrlSummaryListItem(ApiModel):
    """One entry per unique source_url for the home page list."""

    source_url: str
    completed_count: int
    failed_count: int
    pending_count: int
    latest_title: str
    latest_updated_at: datetime


class JobCreatedResponse(ApiModel):
    job_id: str


class JobDeletedResponse(ApiModel):
    status: Literal["deleted"]
    job_id: str
