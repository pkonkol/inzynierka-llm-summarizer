# schemas/job_db.py — stored shape of the jobs collection

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from .base import ApiModel
from .shared_metrics import (
    DeepevalItem,
    SourceMetrics,
    SummaryStatisticalMetrics,
)
from .summary import SummaryResponse, UsageMetadata
from .summary_spec import ProcessingStrategy, ResolvedLength, SummarySpec


# In job_db.py but reachable from a response: JobStatusResponse.metrics exposes it.
class JobMetrics(ApiModel):
    """All None at insert time — metrics are computed asynchronously after the job starts."""

    source: SourceMetrics | None = None
    summary: SummaryStatisticalMetrics | None = None


JobErrorCode = Literal["source_too_long"]


class JobDocument(BaseModel):
    job_id: str
    source_url: str
    model_provider: str
    model_name: str
    processing_strategy: ProcessingStrategy
    summary_spec: SummarySpec
    resolved_length: ResolvedLength | None = None
    language: str
    origin: Literal["admin", "public"]
    run_deepeval: bool
    status: Literal["pending", "running", "completed", "failed"]
    summary_data: SummaryResponse | None = None
    metrics: JobMetrics = Field(default_factory=JobMetrics)
    deepeval_metrics: list[DeepevalItem] = Field(default_factory=list)
    usage: UsageMetadata = Field(default_factory=UsageMetadata)
    raw_metadata: dict[str, Any] = Field(default_factory=dict)
    raw_output: str = ""
    input_text: str = ""
    prompt_template: list[tuple[str, str]] = Field(default_factory=list)
    prompt_params: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    heartbeat_at: datetime
    resume_attempts: int = 0
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: int = 0
    error: str | None = None
    error_code: JobErrorCode | None = None  # set only for failures a visitor can act on
    updated_at: datetime
