# schemas/shared_metrics.py

from pydantic import Field

from .base import ApiModel


class DeepevalItem(ApiModel):
    name: str
    score: float
    passed: bool
    reason: str


class PairwiseDeepevalItem(ApiModel):
    """score: raw GEval score, higher favors the AI summary (actual_output) over golden (expected_output)."""

    name: str
    score: float
    reason: str


class CrossMetrics(ApiModel):
    rouge1: float
    rouge2: float
    rougeL: float
    meteor: float
    deepeval: list[PairwiseDeepevalItem] = Field(default_factory=list)


class SourceMetrics(ApiModel):
    char_count: int
    flesch_kincaid_grade: float
    text_standard: float


class SummaryStatisticalMetrics(ApiModel):
    char_count: int
    flesch_kincaid_grade: float
    text_standard: float
    length_ratio: float  # summary chars / source chars


class KeyTakeawaysMetrics(ApiModel):
    bullet_count: int
    char_count: int


class GoldenMetrics(ApiModel):
    source: SourceMetrics
    summary: SummaryStatisticalMetrics
    deepeval: list[DeepevalItem]


class AiMetrics(ApiModel):
    summary: SummaryStatisticalMetrics
    key_takeaways: KeyTakeawaysMetrics
    deepeval: list[DeepevalItem] | None = None  # None until the separate GEval pass runs
