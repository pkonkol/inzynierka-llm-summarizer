# schemas/evaluation_run_api.py — request/response shapes for /api/v1/research evaluation runs

from datetime import datetime
from typing import Literal

from pydantic import Field

from .base import ApiModel
from .shared_metrics import AiMetrics, CrossMetrics, GoldenMetrics

RunStatus = Literal["pending", "running", "completed", "failed"]
EntryStatus = Literal["pending", "completed", "failed"]


class DeepevalPassMetrics(ApiModel):
    """Progress of the GEval pass, which runs separately from the run itself."""

    status: Literal["running", "completed", "failed"]
    started_at: datetime | None = None
    finished_at: datetime | None = None
    updated_entries: int | None = None
    skipped_entries: int | None = None
    error: str | None = None


class EvaluationRunAggregateMetrics(ApiModel):
    # Every field is optional because the document fills up over the run's lifetime: `{}` at
    # creation, counts when the run ends, `deepeval` only once the GEval pass is asked for.
    entry_count: int | None = None
    completed_entries: int | None = None
    failed_entries: int | None = None
    error: str | None = None
    deepeval: DeepevalPassMetrics | None = None


class EvaluationRunEntryResponse(ApiModel):
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


class EvaluationRunCreateRequest(ApiModel):
    model_provider: str
    model_name: str
    summary_mode: str = "simple"
    language: str = "en"
    rate_limit_delay_ms: int = 0


class EvaluationRunResponse(ApiModel):
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
    aggregate_metrics: EvaluationRunAggregateMetrics = Field(
        default_factory=EvaluationRunAggregateMetrics
    )


class EvaluationRunEntriesResponse(ApiModel):
    entries: list[EvaluationRunEntryResponse] = Field(default_factory=list)


class EvaluationRunListItemResponse(ApiModel):
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


class EvaluationRunCreateResponse(ApiModel):
    evaluation_run_id: str
    status: RunStatus
    created_at: datetime


class EvaluationRunDeletedResponse(ApiModel):
    status: Literal["deleted"]
    evaluation_run_id: str


class DeepevalQueuedResponse(ApiModel):
    status: Literal["queued"]
    run_id: str
