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


class SourceMetrics(BaseModel):
    char_count: int
    flesch_kincaid_grade: float
    text_standard: float


class SummaryStatisticalMetrics(BaseModel):
    char_count: int
    flesch_kincaid_grade: float
    text_standard: float
    length_ratio: float  # summary chars / source chars


class KeyTakeawaysMetrics(BaseModel):
    bullet_count: int
    char_count: int


class GoldenMetrics(BaseModel):
    source: SourceMetrics
    summary: SummaryStatisticalMetrics
    deepeval: list[DeepevalItem]


class AiMetrics(BaseModel):
    summary: SummaryStatisticalMetrics
    key_takeaways: KeyTakeawaysMetrics
    deepeval: list[DeepevalItem] | None = None  # None until the separate GEval pass runs
