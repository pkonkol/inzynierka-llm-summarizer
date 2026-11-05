# schemas/calibration_api.py — the judge-calibration sample and the author's labels, as files and as the dev-only API serves them

from typing import Literal

from pydantic import Field

from .base import ApiModel

CalibrationSplit = Literal["train", "dev", "test"]
SummaryOrigin = Literal["golden", "ai"]


class CalibrationSource(ApiModel):
    source_id: str
    set_name: str
    language: str
    entry_id: str
    input_text: str
    keyfacts: list[str]
    keyfacts_approved: bool
    split: CalibrationSplit


class CalibrationSummary(ApiModel):
    """summary_id is random, so nothing in it reveals whether a human or a model wrote the text."""

    summary_id: str
    source_id: str
    origin: SummaryOrigin
    generator_model: str | None  # None for golden summaries
    processing_strategy: str | None  # None for golden summaries
    text: str
    sentences: list[str]


class CalibrationSample(ApiModel):
    sources: list[CalibrationSource]
    summaries: list[CalibrationSummary]


class BlindSummary(ApiModel):
    summary_id: str
    source_id: str
    sentences: list[str]


class BlindPair(ApiModel):
    source_id: str
    first_summary_id: str
    second_summary_id: str


class CalibrationSampleResponse(ApiModel):
    sources: list[CalibrationSource]
    summaries: list[BlindSummary]
    pairs: list[BlindPair]


class SentenceLabel(ApiModel):
    faithful: bool | None  # None marks the sentence as unclear, which leaves it out of TPR/TNR
    carries_keyfact: bool | None


class SummaryLabels(ApiModel):
    sentences: list[SentenceLabel]
    keyfacts_present: list[bool | None]
    coherent: bool


class KeyfactsApproval(ApiModel):
    keyfacts: list[str]


class PairVerdict(ApiModel):
    better_summary_id: str


class CalibrationLabels(ApiModel):
    summaries: dict[str, SummaryLabels] = Field(default_factory=dict)
    keyfacts: dict[str, KeyfactsApproval] = Field(default_factory=dict)
    pairs: dict[str, PairVerdict] = Field(default_factory=dict)
