# schemas/evaluation_run.py

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from .shared_metrics import AiMetrics, CrossMetrics, GoldenMetrics

RunStatus = Literal["pending", "running", "completed", "failed"]

# --- DB document shape (evaluation_runs collection) ---

class EvaluationRunEntryDocument(BaseModel):
    """title/url/golden_metrics are NOT stored here; they live on the EvaluationSet and
    are joined onto EvaluationRunEntryResponse at read time. Exception: golden_summary IS
    duplicated because it's load-bearing (used as the cross-metric reference text during
    the run itself, not just for display).
    """
    entry_id: str
    golden_summary: str
    ai_summary: str | None = None
    ai_key_takeaways: list[str] = Field(default_factory=list)
    ai_metrics: AiMetrics | None = None
    cross_metrics: CrossMetrics | None = None
    status: Literal["pending", "completed", "failed"] = "pending"
    error: str | None = None

class EvaluationRunDocument(BaseModel):
    evaluation_set_id: str
    evaluation_set_name: str
    model_provider: str
    model_name: str
    summary_mode: str
    language: str
    rate_limit_delay_ms: int
    status: RunStatus
    created_at: datetime
    finished_at: datetime | None = None
    entries: list[EvaluationRunEntryDocument]
    aggregate_metrics: dict[str, Any] = Field(default_factory=dict)

# --- API request/response shapes ---

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
    status: Literal["pending", "completed", "failed"] = "pending"
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
