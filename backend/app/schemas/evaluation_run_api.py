# schemas/evaluation_run_api.py — request/response shapes for /api/v1/research evaluation runs

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from .shared_metrics import AiMetrics, CrossMetrics, GoldenMetrics

RunStatus = Literal["pending", "running", "completed", "failed"]
EntryStatus = Literal["pending", "completed", "failed"]


class EvaluationRunEntryResponse(BaseModel):
    """API-facing shape — includes title/url/golden_metrics joined from the parent set."""
    entry_id: str
    title: str
    url: str
    golden_summary: str
    golden_metrics: GoldenMetrics | None = None
    ai_summary: str | None = None
    ai_key_takeaways: list[str] = Field(default_factory=list)
    ai_metrics: AiMetrics | None = None
    cross_metrics: CrossMetrics | None = None
    status: EntryStatus = "pending"
    error: str | None = None


class EvaluationRunCreateRequest(BaseModel):
    model_provider: str
    model_name: str
    summary_mode: str = "simple"
    language: str = "en"
    rate_limit_delay_ms: int = 0


class EvaluationRunResponse(BaseModel):
    id: str
    evaluation_set_id: str
    evaluation_set_name: str
    model_provider: str
    model_name: str
    summary_mode: str
    language: str
    status: RunStatus
    created_at: datetime
    finished_at: datetime | None = None
    entry_count: int
    aggregate_metrics: dict[str, Any] = Field(default_factory=dict)


class EvaluationRunEntriesResponse(BaseModel):
    entries: list[EvaluationRunEntryResponse] = Field(default_factory=list)


class EvaluationRunListItemResponse(BaseModel):
    evaluation_run_id: str
    evaluation_set_id: str
    evaluation_set_name: str
    model_provider: str
    model_name: str
    summary_mode: str
    language: str
    status: RunStatus
    created_at: datetime
    finished_at: datetime | None = None
    entry_count: int


class EvaluationRunCreateResponse(BaseModel):
    evaluation_run_id: str
    status: RunStatus
    created_at: datetime
