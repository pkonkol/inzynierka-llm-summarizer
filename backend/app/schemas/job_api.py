# schemas/job_api.py — request/response shapes for /api/v1/jobs

from datetime import datetime
from typing import Any, Literal, cast

from pydantic import Field, HttpUrl, model_validator

from .base import ApiModel
from .job_db import JobMetrics
from .shared_metrics import DeepevalItem
from .summary import SummaryResponse, UsageMetadata
from .summary_spec import ProcessingStrategy, ResolvedLength, SummarySpec

JobStatusValue = Literal["pending", "running", "completed", "failed"]

# Marks a job whose source_url carries a title rather than a fetchable address. HttpUrl only
# ever accepts http/https, so this can never collide with a real scraped URL.
MANUAL_SOURCE_PREFIX = "manual:"

_MAX_PASTED_CHARS = 500_000  # ~125k tokens; leaves headroom under Mongo's 16 MB document limit


class JobCreateRequest(ApiModel):
    model_name: str
    model_provider: str
    url: HttpUrl | None = None
    input_text: str | None = Field(default=None, min_length=1, max_length=_MAX_PASTED_CHARS)
    source_title: str | None = Field(default=None, min_length=1, max_length=200)
    language: str = "en"
    processing_strategy: ProcessingStrategy = "direct"
    summary_spec: SummarySpec = Field(default_factory=SummarySpec)
    run_deepeval: bool = False

    @model_validator(mode="after")
    def _require_exactly_one_source(self) -> JobCreateRequest:
        has_url = self.url is not None
        has_pasted_text = self.input_text is not None or self.source_title is not None
        if has_url and has_pasted_text:
            raise ValueError("Provide either url, or input_text and source_title, not both")
        if not has_url:
            if self.input_text is None or self.source_title is None:
                raise ValueError("Provide either url, or both input_text and source_title")
            if not self.source_title.strip():
                raise ValueError("source_title must not be blank")
        return self

    def source_url_and_text(self) -> tuple[str, str]:
        """-> (source_url, input_text); a URL job has its text scraped later, so it starts empty."""
        if self.url is not None:
            return str(self.url), ""
        title = cast(str, self.source_title).strip()
        return f"{MANUAL_SOURCE_PREFIX}{title}", cast(str, self.input_text)

    @model_validator(mode="after")
    def _reject_match_reference_length(self) -> JobCreateRequest:
        # match_reference needs a golden_summary, which jobs never have — only evaluation runs do.
        if self.summary_spec.length.policy == "match_reference":
            raise ValueError("length policy 'match_reference' is only valid for evaluation runs")
        return self


class JobStatusResponse(ApiModel):
    job_id: str
    source_url: str
    status: JobStatusValue
    model_provider: str
    model_name: str
    processing_strategy: ProcessingStrategy
    summary_spec: SummarySpec
    resolved_length: ResolvedLength | None = None
    summary_data: SummaryResponse | None = None
    metrics: JobMetrics
    deepeval_metrics: list[DeepevalItem]
    usage: UsageMetadata
    raw_metadata: dict[str, Any] = Field(default_factory=dict)
    raw_output: str = ""
    input_text: str = ""
    prompt_template: list[tuple[str, str]]
    prompt_params: dict[str, Any] = Field(default_factory=dict)
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
    processing_strategy: ProcessingStrategy
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
