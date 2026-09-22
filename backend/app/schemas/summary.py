# schemas/summary.py — LLM layer output shapes (not API- or DB-specific)

from typing import Any

from pydantic import BaseModel

from .base import ApiModel


class SummaryResponse(ApiModel):
    """What a completed job stores and the API returns.

    summary is markdown: prose, or a bullet list when the spec asked for bullets. title comes
    from its own model call and source_url from the job.
    """

    title: str
    summary: str
    source_url: str


class UsageMetadata(ApiModel):
    input_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0
    total_tokens: int = 0

    def __add__(self, other: UsageMetadata) -> UsageMetadata:
        """extract_then_synthesize sums the usage of its two calls."""
        return UsageMetadata(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            thinking_tokens=self.thinking_tokens + other.thinking_tokens,
            total_tokens=self.total_tokens + other.total_tokens,
        )


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
