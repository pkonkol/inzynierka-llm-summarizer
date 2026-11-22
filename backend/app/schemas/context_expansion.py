# schemas/context_expansion.py — related sources found before summarization (ADR 0006)

from datetime import datetime
from typing import Literal

from .base import ApiModel
from .usage import UsageMetadata

SearchChannel = Literal["web", "discussions", "science", "factcheck_google", "factcheck_web"]
ContextExpansionMode = Literal["none", "single_search", "staged"]


class ClaimReview(ApiModel):
    claim: str  # the claim the publisher checked, which may differ from the one in the article
    publisher: str
    verdict: str  # the publisher's own rating, verbatim
    reviewed_at: datetime | None


class SearchCandidate(ApiModel):
    channel: SearchChannel
    url: str
    title: str | None  # Exa does not always return a title
    text: str
    published_at: datetime | None  # Exa does not always return a date
    review: ClaimReview | None = None  # only Google Fact Check hits carry one
    query: str | None = None  # the claim query that found it; only the fact check channels set it


class ChannelOutcome(ApiModel):
    channel: SearchChannel
    queries: list[str]
    result_count: int
    duration_ms: int
    cost_usd: float | None  # only providers that report a cost fill it
    error: str | None


class RelatedSource(ApiModel):
    channel: SearchChannel
    url: str
    title: str | None
    excerpt: str
    selection_reason: str
    review: ClaimReview | None = None


class PlannedQueries(ApiModel):
    web: list[str]
    discussions: list[str]
    science: list[str]


class ContextExpansionResult(ApiModel):
    mode: ContextExpansionMode
    channels: list[ChannelOutcome]
    candidate_count: int
    selected: list[RelatedSource]
    usage: UsageMetadata
    duration_ms: int
