# schemas/research.py

from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field

# --- shared sub-models ---

class SourceMeta(BaseModel):
    url: str | None = None
    title: str
    source: str | None = None   # "cnn", "own", "moldbug", …
    author: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)

class DeepevalItem(BaseModel):
    name: str
    score: float | None = None
    passed: bool | None = None
    reason: str | None = None

class CrossMetrics(BaseModel):
    rouge1: float | None = None
    rouge2: float | None = None
    rougeL: float | None = None
    meteor: float | None = None
    deepeval: list[DeepevalItem] = Field(default_factory=list)

class GoldenMetrics(BaseModel):
    text_stats: dict[str, Any] | None = None
    readability: dict[str, Any] | None = None
    deepeval: dict[str, Any] | None = None

# --- EvaluationSet ---

class EvaluationSetEntryImport(BaseModel):
    input_text: str
    golden_summary: str
    source_meta: dict[str, Any] = Field(default_factory=dict)
    golden_metrics: GoldenMetrics | None = None

class EvaluationSetImportRequest(BaseModel):
    name: str
    language: str = "en"
    entries: list[EvaluationSetEntryImport]

class EvaluationSetEntryResponse(BaseModel):
    entry_id: str
    golden_summary: str
    source_meta: dict[str, Any] = Field(default_factory=dict)
    golden_metrics: GoldenMetrics | None = None

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

# --- EvaluationRun ---

RunStatus = Literal["pending", "running", "completed", "failed"]

class EvaluationRunEntry(BaseModel):
    entry_id: str
    golden_summary: str
    golden_metrics: GoldenMetrics | None = None
    ai_summary: str | None = None
    ai_key_takeaways: list[str] = Field(default_factory=list)
    ai_metrics: dict[str, Any] | None = None
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
    entries: list[EvaluationRunEntry] = Field(default_factory=list)
    aggregate_metrics: dict[str, Any] = Field(default_factory=dict)

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