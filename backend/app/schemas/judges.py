# schemas/judges.py — structured output of the fact-level and coherence judges, and their scores

from typing import Literal

from pydantic import Field

from .base import ApiModel
from .usage import UsageMetadata

FactErrorType = Literal["unsupported", "contradicted", "out_of_context", "other"]


class SentenceFaithfulness(ApiModel):
    sentence_index: int
    faithful: bool
    error_type: FactErrorType | None
    reason: str


class FaithfulnessJudgement(ApiModel):
    sentences: list[SentenceFaithfulness]


class KeyfactMatch(ApiModel):
    keyfact_index: int
    present: bool
    sentence_indices: list[int]


class AlignmentJudgement(ApiModel):
    keyfacts: list[KeyfactMatch]


class ExtractedKeyfacts(ApiModel):
    keyfacts: list[str]


class CoherenceJudgement(ApiModel):
    coherent: bool
    reason: str


class FactLevelScores(ApiModel):
    faithfulness: float  # share of summary sentences supported by the source
    completeness: float  # share of key facts present in the summary
    # Share of summary sentences that carry a key fact no earlier sentence carried.
    conciseness: float
    has_repetition: bool
    repeated_sentence_indices: list[int]


class FactLevelResult(ApiModel):
    scores: FactLevelScores
    faithfulness: FaithfulnessJudgement
    alignment: AlignmentJudgement
    judge_model: str
    prompt_version: str  # faithfulness and alignment prompt versions, joined with "+"
    usage: UsageMetadata


class CoherenceResult(ApiModel):
    judgement: CoherenceJudgement
    judge_model: str
    prompt_version: str
    usage: UsageMetadata


class DeepevalItem(ApiModel):
    name: str
    score: float
    passed: bool
    reason: str
    judge_model: str | None = None  # None on results judged before judge provenance was stored
    rubric_version: str | None = None


class SummaryJudgement(ApiModel):
    """Every judge on one summary with one judge model; error set means the judge answer was unusable."""

    judge_model: str
    sentences: list[str] = Field(default_factory=list)  # the split the sentence verdicts index into
    fact_level: FactLevelResult | None = None
    coherence: CoherenceResult | None = None
    summarization_metric: DeepevalItem | None = None
    error: str | None = None


class SourceKeyfacts(ExtractedKeyfacts):
    model: str  # provider:name of the model that extracted them


class TprTnr(ApiModel):
    tpr: float
    tnr: float


class JudgeCalibration(ApiModel):
    """TPR/TNR of a judge model on the test split of the calibration set (data/calibration/report_test.md)."""

    faithfulness: TprTnr
    keyfact_present: TprTnr
    sentence_carries_keyfact: TprTnr
    coherence: TprTnr
