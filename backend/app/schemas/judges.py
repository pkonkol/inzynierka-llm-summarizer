# schemas/judges.py — structured output of the fact-level and coherence judges, and their scores

from typing import Literal

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
