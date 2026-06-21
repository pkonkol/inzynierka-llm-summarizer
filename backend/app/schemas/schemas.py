from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, model_validator

from .summary import SummaryResponse


class JobCreateRequest(BaseModel):
    model_name: str
    model_provider: str
    url: str
    language: str = "en"


class UsageMetadata(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0
    total_tokens: int = 0

    @model_validator(mode="before")
    @classmethod
    def coerce_none_to_zero(cls, values: Any) -> Any:
        if isinstance(values, dict):
            return {k: (v if v is not None else 0) for k, v in values.items()}
        return values


class JobStatusResponse(BaseModel):
    job_id: str
    source_url: str
    status: Literal["pending", "completed", "failed"]
    model_provider: str = ""
    model_name: str = ""
    summary_data: SummaryResponse | None = None
    usage: UsageMetadata = UsageMetadata()
    raw_metadata: dict[str, Any] = {}
    created_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: int = 0
    error: str | None = None

    @model_validator(mode="before")
    @classmethod
    def coerce_missing(cls, values: Any) -> Any:
        if isinstance(values, dict):
            if not values.get("usage"):
                values["usage"] = {}
            if not values.get("raw_metadata"):
                values["raw_metadata"] = {}
        return values


class JobListItemResponse(BaseModel):
    """Flat per-job entry used by GET /api/v1/jobs/list (the /jobs debug page)."""
    job_id: str
    source_url: str
    status: Literal["pending", "completed", "failed"]
    title: str = ""
    short_summary: str = ""
    model_provider: str = ""
    model_name: str = ""
    updated_at: datetime | None = None


class UrlSummaryListItem(BaseModel):
    """One entry per unique source_url for the home page list."""
    source_url: str
    completed_count: int
    failed_count: int
    latest_title: str
    latest_updated_at: datetime | None = None
