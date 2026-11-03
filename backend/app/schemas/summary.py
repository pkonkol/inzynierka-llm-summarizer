# schemas/summary.py — LLM layer output shapes (not API- or DB-specific)

from typing import Any

from pydantic import BaseModel

from .base import ApiModel
from .context_expansion import RelatedSource
from .summary_spec import ResolvedLength, SummarySpec
from .usage import UsageMetadata


class SummaryResponse(ApiModel):
    """What a completed job stores and the API returns.

    summary is markdown: prose, or a bullet list when the spec asked for bullets. title comes
    from its own model call and source_url from the job.
    """

    title: str
    summary: str
    source_url: str


class LlmSummaryRequest(BaseModel):
    """Everything a processing strategy needs to produce one summary."""

    text: str
    source_url: str
    model_provider: str
    model_name: str
    language: str
    spec: SummarySpec
    length: ResolvedLength
    related_sources: list[RelatedSource]


class LlmSummaryResult(BaseModel):
    """Full result of a summarization run — the summary plus call metadata."""

    summary: str
    source_url: str
    usage: UsageMetadata
    raw_metadata: dict[str, Any]
    raw_output: str
    input_text: str
    prompt_template: list[tuple[str, str]]
    prompt_params: dict[str, Any]
