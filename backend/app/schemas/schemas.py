from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

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


class UrlSummaryListItem(BaseModel):
    """One entry per unique source_url for the left-hand list."""
    source_url: str
    completed_count: int
    failed_count: int
    latest_title: str
    latest_updated_at: datetime | None = None
