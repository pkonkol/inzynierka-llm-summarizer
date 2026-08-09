# schemas/evaluation_set.py

from datetime import datetime

from pydantic import BaseModel

from .shared_metrics import GoldenMetrics

# --- DB document shape (evaluation_sets collection) ---

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

# --- API request/response shapes ---

class EvaluationSetEntryImport(BaseModel):
    input_text: str
    golden_summary: str
    title: str
    url: str
    golden_metrics: GoldenMetrics | None = None

class EvaluationSetImportRequest(BaseModel):
    name: str
    language: str = "en"
    entries: list[EvaluationSetEntryImport]

class EvaluationSetEntryResponse(EvaluationSetEntryImport):
    pass

class EvaluationSetEntryInputTextResponse(BaseModel):
    entry_id: str
    input_text: str

class EvaluationSetListItemResponse(BaseModel):
    evaluation_set_id: str
    name: str
    language: str
    entry_count: int
    created_at: datetime

class EvaluationSetCreateResponse(BaseModel):
    evaluation_set_id: str
    name: str
    language: str
    entry_count: int
    created_at: datetime

class EvaluationSetDetailResponse(BaseModel):
    evaluation_set_id: str
    name: str
    language: str
    created_at: datetime
    entries: list[EvaluationSetEntryResponse]
