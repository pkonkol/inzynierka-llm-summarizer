# schemas/evaluation_set_db.py — stored shape of the evaluation_sets collection

from datetime import datetime

from pydantic import BaseModel

from .shared_metrics import GoldenMetrics


class EvaluationSetEntryDocument(BaseModel):
    entry_id: str
    input_text: str
    golden_summary: str
    title: str
    url: str
    golden_metrics: GoldenMetrics | None = None


class EvaluationSetDocument(BaseModel):
    name: str
    language: str
    created_at: datetime
    entries: list[EvaluationSetEntryDocument]
