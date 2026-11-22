# schemas/fact_check.py — the assessment written after a summary, stored on its job

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from .base import ApiModel
from .context_expansion import ChannelOutcome, ContextExpansionResult, RelatedSource
from .usage import UsageMetadata

FactCheckStatus = Literal["pending", "running", "completed", "failed"]
SourceStance = Literal["supports", "contradicts", "context"]


class AssessedSource(RelatedSource):
    stance: (
        SourceStance  # what the source does to the article's claims, as the assessment judged it
    )


class FactCheckSearch(ApiModel):
    claims: list[str]  # the claim queries the model wrote
    channels: list[ChannelOutcome]
    usage: UsageMetadata
    duration_ms: int


class FactCheck(ApiModel):
    status: FactCheckStatus
    requested_at: datetime  # the public daily web search limit counts fact checks by it
    text: str | None  # markdown with [n] markers; set once completed
    sources: list[AssessedSource]  # [n] in text points at sources[n - 1]; fact checks first
    context_expansion: ContextExpansionResult | None
    fact_check_search: FactCheckSearch | None  # set once completed
    usage: UsageMetadata | None
    duration_ms: int | None
    error: str | None


class LlmAssessmentRequest(BaseModel):
    text: str
    source_url: str
    language: str
    model_provider: str
    model_name: str
    target_words: int
    related_sources: list[RelatedSource]


class LlmAssessmentResult(BaseModel):
    text: str
    source_stances: list[SourceStance]  # one per related source, in the request's order
    usage: UsageMetadata
    raw_output: str
