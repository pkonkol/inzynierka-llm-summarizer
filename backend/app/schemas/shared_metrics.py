# schemas/shared_metrics.py

from pydantic import BaseModel, Field


class DeepevalItem(BaseModel):
    name: str
    score: float
    passed: bool
    reason: str


class PairwiseDeepevalItem(BaseModel):
    """score: raw GEval score, higher favors the AI summary (actual_output) over golden (expected_output)."""
    name: str
    score: float
    reason: str


class CrossMetrics(BaseModel):
    rouge1: float
    rouge2: float
    rougeL: float
    meteor: float
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
