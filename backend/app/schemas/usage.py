# schemas/usage.py — token counts of one or more model calls

from .base import ApiModel


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
