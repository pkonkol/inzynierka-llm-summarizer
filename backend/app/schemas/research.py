# schemas/research.py

from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field
from bson import ObjectId

# --- shared sub-models ---

class SourceMeta(BaseModel):
    url: str | None = None
    title: str
    source: str | None = None   # "cnn", "own", "moldbug", …
    author:  str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)

class TextMetrics(BaseModel):
    word_count: int | None = None
    char_count: int | None = None
    flesch_reading_ease: float | None = None

class DeepevalItem(BaseModel):
    name: str
    score: float | None = None
    passed: bool | None = None
    reason: str | None = None

class QualityMetrics(BaseModel):           # golden_metrics / ai_metrics
    text: TextMetrics = Field(default_factory=TextMetrics)
    deepeval: list[DeepevalItem] = Field(default_factory=list)

class CrossMetrics(BaseModel):
    rouge1: float | None = None
    rouge2: float | None = None
    rougeL: float | None = None
    meteor: float | None = None
    deepeval: list[DeepevalItem] = Field(default_factory=list)

# --- EvaluationSet ---

class EvalSetEntry(BaseModel):
    entry_id: str                          # ulid/uuid generowany przy imporcie
    input_text: str
    golden_summary: str
    source_meta: SourceMeta
    golden_metrics: QualityMetrics | None = None

class EvaluationSetImport(BaseModel):      # body POST /evaluation-sets
    name: str
    language: str = "en"
    entries: list[EvalSetEntry]

class EvaluationSetResponse(BaseModel):
    id: str
    name: str
    language: str
    created_at: datetime
    entry_count: int

class EvaluationSetDetail(EvaluationSetResponse):
    entries: list[EvalSetEntry]            # bez input_text w liście (patrz niżej)

# --- EvaluationRun ---

RunStatus = Literal["pending", "running", "completed", "failed"]
RunEntryStatus = Literal["pending", "completed", "failed"] # TODO czy to w ogole potrzebne?


class EvaluationRunEntry(BaseModel):
    entry_id: str
    golden_summary: str # snapshot z setu
    golden_metrics: QualityMetrics | None = None
    ai_summary: str | None = None
    ai_key_takeaways: list[str] = Field(default_factory=list)
    ai_metrics: QualityMetrics | None = None
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


# --- import/export models

class GoldenMetrics(BaseModel):
    text_stats: dict[str, Any] | None = None
    readability: dict[str, Any] | None = None
    deepeval: dict[str, Any] | None = None


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
