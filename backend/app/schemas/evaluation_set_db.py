# schemas/evaluation_set_db.py — stored shape of the evaluation_sets collection

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from .judges import SourceKeyfacts, SummaryJudgement
from .shared_metrics import GoldenMetrics

GoldenMetricsPassStatus = Literal["skipped", "pending", "running", "completed", "failed"]


class EvaluationSetEntryDocument(BaseModel):
    entry_id: str
    input_text: str
    golden_summary: str | None
    title: str
    url: str
    golden_metrics: GoldenMetrics | None = None
    keyfacts: SourceKeyfacts | None = None  # extracted by the first judge pass that needs them
    golden_judges: list[SummaryJudgement] = Field(default_factory=list)  # one per judge model


class GoldenMetricsPassDocument(BaseModel):
    status: GoldenMetricsPassStatus
    heartbeat_at: datetime
    resume_attempts: int = 0
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: str | None = None
    git_sha: str | None = None


class EvaluationSetDocument(BaseModel):
    name: str
    language: str
    created_at: datetime
    entries: list[EvaluationSetEntryDocument]
    # None means the set was imported before this field existed.
    golden_metrics_pass: GoldenMetricsPassDocument | None = None
