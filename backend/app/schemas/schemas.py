from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from .summary import SummaryResponse

SummaryMode = Literal["simple", "sequential", "cascade"]


class JobCreateRequest(BaseModel):
    model_name: str
    model_provider: str
    url: str
    language: str = "en"
    summary_mode: SummaryMode = "simple"
    run_deepeval: bool = False # TODO przeslanie z frontu


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


class JobMetrics(BaseModel):
    source: dict[str, Any] = Field(default_factory=dict)
    summary: dict[str, Any] = Field(default_factory=dict)
    key_takeaways: dict[str, Any] = Field(default_factory=dict)
    compression: dict[str, Any] = Field(default_factory=dict)


class DeepevalMetricItem(BaseModel):
    name: str
    passed: bool | None = None
    score: float | None = None
    reason: str | None = None


class DeepevalMetrics(BaseModel):
    summary: list[DeepevalMetricItem] = Field(default_factory=list)
    summary_input: list[DeepevalMetricItem] = Field(default_factory=list)
    takeaways: list[DeepevalMetricItem] = Field(default_factory=list)
    takeaways_input: list[DeepevalMetricItem] = Field(default_factory=list)
    summary_takeaways: list[DeepevalMetricItem] = Field(default_factory=list)

class JobStatusResponse(BaseModel):
    job_id: str
    source_url: str
    status: Literal["pending", "completed", "failed"]
    model_provider: str
    model_name: str
    summary_mode: SummaryMode
    summary_data: SummaryResponse | None = None
    metrics: JobMetrics = Field(default_factory=JobMetrics)
    deepeval_metrics: DeepevalMetrics = Field(default_factory=DeepevalMetrics)
    usage: UsageMetadata = Field(default_factory=UsageMetadata)
    raw_metadata: dict[str, Any]
    raw_output: str
    input_text: str
    prompt_template: list[list[str]]
    prompt_params: dict[str, str]
    created_at: datetime | None
    started_at: datetime | None
    finished_at: datetime | None
    duration_ms: int
    error: str | None = None


class JobListItemResponse(BaseModel):
    """Flat per-job entry used by GET /api/v1/jobs/list."""
    job_id: str
    source_url: str
    status: Literal["pending", "completed", "failed"]
    title: str = ""
    summary: str = ""
    model_provider: str = ""
    model_name: str = ""
    summary_mode: SummaryMode = "simple"
    updated_at: datetime | None = None


class UrlSummaryListItem(BaseModel):
    """One entry per unique source_url for the home page list."""
    source_url: str
    completed_count: int
    failed_count: int
    latest_title: str
    latest_updated_at: datetime | None = None
