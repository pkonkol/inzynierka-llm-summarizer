# schemas/fact_check.py — the assessment written after a summary, stored on its job

from typing import Literal

from pydantic import BaseModel

from .base import ApiModel
from .context_expansion import ContextExpansionResult, RelatedSource
from .usage import UsageMetadata

FactCheckStatus = Literal["pending", "running", "completed", "failed"]


class FactCheck(ApiModel):
    status: FactCheckStatus
    text: str | None  # markdown with [n] markers; set once completed
    sources: list[RelatedSource]  # [n] in text points at sources[n - 1]
    context_expansion: ContextExpansionResult | None
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
    usage: UsageMetadata
    raw_output: str
