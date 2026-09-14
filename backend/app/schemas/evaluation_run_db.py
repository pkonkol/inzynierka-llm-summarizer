# schemas/evaluation_run_db.py — stored shape of the evaluation_runs collection

from datetime import datetime

from pydantic import BaseModel, Field

from .evaluation_run_api import EntryStatus, EvaluationRunAggregateMetrics, RunStatus
from .shared_metrics import AiMetrics, CrossMetrics
from .summary_spec import ProcessingStrategy, SummarySpec


class EvaluationRunEntryDocument(BaseModel):
    """title/url/golden_metrics are NOT stored here; they live on the EvaluationSet and
    are joined onto EvaluationRunEntryResponse at read time. Exception: golden_summary IS
    duplicated because it's load-bearing (used as the cross-metric reference text during
    the run itself, not just for display).
    """

    entry_id: str
    golden_summary: str
    ai_summary: str | None = None
    ai_key_takeaways: list[str] | None = None
    resolved_length: dict[str, int] | None = None
    ai_metrics: AiMetrics | None = None
    cross_metrics: CrossMetrics | None = None
    status: EntryStatus = "pending"
    error: str | None = None


class EvaluationRunDocument(BaseModel):
    evaluation_set_id: str
    evaluation_set_name: str
    model_provider: str
    model_name: str
    processing_strategy: ProcessingStrategy
    summary_spec: SummarySpec
    language: str
    rate_limit_delay_ms: int
    status: RunStatus
    created_at: datetime
    heartbeat_at: datetime
    resume_attempts: int = 0
    finished_at: datetime | None = None
    entries: list[EvaluationRunEntryDocument]
    aggregate_metrics: EvaluationRunAggregateMetrics = Field(
        default_factory=EvaluationRunAggregateMetrics
    )
