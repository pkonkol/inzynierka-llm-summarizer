# schemas/research.py

from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field

# --- shared sub-models ---

class DeepevalItem(BaseModel):
    name: str
    score: float | None = None
    passed: bool | None = None
    reason: str | None = None

class PairwiseDeepevalItem(BaseModel):
    name: str
    winner: Literal["A", "B", "tie"]
    score_A: float
    score_B: float
    reason: str

class CrossMetrics(BaseModel):
    rouge1: float | None = None
    rouge2: float | None = None
    rougeL: float | None = None
    meteor: float | None = None
    deepeval: list[PairwiseDeepevalItem] = Field(default_factory=list)

class SummaryDeterministicMetrics(BaseModel):
    word_count: int
    sentence_count: int
    avg_sentence_length: float
    type_token_ratio: float
    lexical_density: float | None = None  # None only if en_core_web_sm isn't installed
    flesch_reading_ease: float
    flesch_kincaid_grade: float
    gunning_fog: float
    smog_index: float
    coleman_liau_index: float
    automated_readability_index: float
    text_standard: float
    # compression: summary-vs-source relationship, folded in rather than a sibling section
    source_word_count: int
    word_ratio: float
    char_ratio: float

class KeyTakeawaysMetrics(BaseModel):
    bullet_count: int
    total_lines: int
    word_count: int
    unique_word_count: int
    type_token_ratio: float | None = None       # None only if zero takeaways generated
    avg_bullet_word_count: float | None = None  # None only if zero takeaways generated

class GoldenMetrics(BaseModel):
    summary: SummaryDeterministicMetrics
    deepeval: list[DeepevalItem]

class AiMetrics(BaseModel):
    summary: SummaryDeterministicMetrics
    key_takeaways: KeyTakeawaysMetrics
    deepeval: list[DeepevalItem] | None = None  # None until the separate GEval pass runs

# --- EvaluationSet ---

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

class EvaluationSetEntryResponse(BaseModel):
    entry_id: str
    golden_summary: str
    title: str
    url: str
    golden_metrics: GoldenMetrics | None = None

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

# --- EvaluationRun ---

RunStatus = Literal["pending", "running", "completed", "failed"]

class EvaluationRunEntry(BaseModel):
    """Stored shape in Mongo — only entry_id and AI-generated fields.

    title/url/golden_summary/golden_metrics are NOT stored here; they live on the
    EvaluationSet and are joined onto EvaluationRunEntryResponse at read time.
    Exception: golden_summary IS duplicated because it's load-bearing (used as the
    cross-metric reference text during the run itself, not just for display).
    """
    entry_id: str
    golden_summary: str
    ai_summary: str | None = None
    ai_key_takeaways: list[str] = Field(default_factory=list)
    ai_metrics: AiMetrics | None = None
    cross_metrics: CrossMetrics | None = None
    status: Literal["pending", "completed", "failed"] = "pending"
    error: str | None = None

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
