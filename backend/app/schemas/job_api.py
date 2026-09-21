# schemas/job_api.py — request/response shapes for /api/v1/jobs

import re
from datetime import datetime
from typing import Any, Literal, Self, cast

from pydantic import Field, HttpUrl, model_validator

from .base import ApiModel
from .job_db import JobMetrics
from .shared_metrics import DeepevalItem
from .summary import SummaryResponse, UsageMetadata
from .summary_spec import ProcessingStrategy, ResolvedLength, SummarySpec

JobStatusValue = Literal["pending", "running", "completed", "failed"]

# Marks a job whose source_url is a key derived from the pasted text rather than a fetchable
# address. HttpUrl only ever accepts http/https, so this can never collide with a real scraped URL.
MANUAL_SOURCE_PREFIX = "manual:"

_MAX_PASTED_CHARS = 500_000  # ~125k tokens; leaves headroom under Mongo's 16 MB document limit
_MAX_SOURCE_KEY_CHARS = 200
_SENTENCE_END = re.compile(r"(?<=[.!?])\s")


def _first_sentence(text: str) -> str:
    normalized = " ".join(text.split())
    return _SENTENCE_END.split(normalized, maxsplit=1)[0][:_MAX_SOURCE_KEY_CHARS]


JobOrigin = Literal["admin", "public"]


class SummarizeSourceRequest(ApiModel):
    """What every summarize endpoint accepts: one source and how to summarize it."""

    url: HttpUrl | None = None
    input_text: str | None = Field(default=None, min_length=1, max_length=_MAX_PASTED_CHARS)
    summary_spec: SummarySpec = Field(default_factory=SummarySpec)

    @model_validator(mode="after")
    def _require_exactly_one_source(self) -> Self:
        if self.url is not None and self.input_text is not None:
            raise ValueError("Provide either url or input_text, not both")
        if self.url is None:
            if self.input_text is None:
                raise ValueError("Provide either url or input_text")
            if not self.input_text.strip():
                raise ValueError("input_text must not be blank")
        return self

    def source_url_and_text(self) -> tuple[str, str]:
        """-> (source_url, input_text); a URL job has its text scraped later, so it starts empty.

        A pasted text is keyed by its first sentence: the same text always lands under the same
        source_url, whatever title the model later gives it.
        """
        if self.url is not None:
            return str(self.url), ""
        text = cast(str, self.input_text)
        return f"{MANUAL_SOURCE_PREFIX}{_first_sentence(text)}", text

    @model_validator(mode="after")
    def _reject_match_reference_length(self) -> Self:
        # match_reference needs a golden_summary, which jobs never have — only evaluation runs do.
        if self.summary_spec.length.policy == "match_reference":
            raise ValueError("length policy 'match_reference' is only valid for evaluation runs")
        return self


class JobCreateRequest(SummarizeSourceRequest):
    model_name: str
    model_provider: str
    language: str = "en"
    processing_strategy: ProcessingStrategy = "direct"
    run_deepeval: bool = False


class JobStatusResponse(ApiModel):
    job_id: str
    source_url: str
    status: JobStatusValue
    model_provider: str
    model_name: str
    processing_strategy: ProcessingStrategy
    summary_spec: SummarySpec
    language: str
    origin: JobOrigin = "admin"
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
