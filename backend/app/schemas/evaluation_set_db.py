# schemas/evaluation_set_db.py — stored shape of the evaluation_sets collection

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from .shared_metrics import GoldenMetrics

GoldenMetricsPassStatus = Literal["skipped", "pending", "running", "completed", "failed"]


class EvaluationSetEntryDocument(BaseModel):
    entry_id: str
    input_text: str
    golden_summary: str
    title: str
    url: str
    golden_metrics: GoldenMetrics | None = None


class GoldenMetricsPassDocument(BaseModel):
    status: GoldenMetricsPassStatus
    heartbeat_at: datetime
    resume_attempts: int = 0
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: str | None = None


class EvaluationSetDocument(BaseModel):
    name: str
    language: str
    created_at: datetime
    entries: list[EvaluationSetEntryDocument]
    # None means the set was imported before this field existed.
    golden_metrics_pass: GoldenMetricsPassDocument | None = None
