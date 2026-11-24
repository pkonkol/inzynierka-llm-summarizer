# schemas/shared_metrics.py

from pydantic import Field

from .base import ApiModel
from .judges import DeepevalItem, SummaryJudgement

__all__ = ["DeepevalItem"]


class PairwiseDeepevalItem(ApiModel):
    """score: mean of both presentation orders, higher favors the AI summary over the golden one."""

    name: str
    score: float
    reason: str  # from the AI-first order
    score_ai_first: float | None = None  # None on results judged in a single order only
    score_golden_first: float | None = None
    consistent: bool | None = None  # both orders picked the same winner
    reason_golden_first: str | None = None
    judge_model: str | None = None
    rubric_version: str | None = None


class CrossMetrics(ApiModel):
    rouge1: float
    rouge2: float
    rougeL: float
    meteor: (
        float | None
    )  # None for non-English sets: nltk's METEOR relies on an English stemmer and WordNet
    pairwise: list[PairwiseDeepevalItem] = Field(default_factory=list)  # one per judge model


class SourceMetrics(ApiModel):
    char_count: int
    flesch_kincaid_grade: float


class SummaryStatisticalMetrics(ApiModel):
    char_count: int
    flesch_kincaid_grade: float
    length_ratio: float  # summary chars / source chars


class GoldenMetrics(ApiModel):
    source: SourceMetrics
    summary: SummaryStatisticalMetrics


class AiMetrics(ApiModel):
    summary: SummaryStatisticalMetrics
    judges: list[SummaryJudgement] = Field(default_factory=list)  # one per judge model
