# schemas/summary_spec.py — structured contract for what a summary should look like

import re
from typing import Annotated, Literal

from pydantic import BaseModel, Field

_SENTENCE_SPLIT_RE = re.compile(r"[.!?]+")

NarrativeStance = Literal["about_document", "voice_of_document"]
SummaryFunction = Literal["indicative", "informative", "mixed"]
OutputFormat = Literal["prose", "bullets"]
ProcessingStrategy = Literal["direct", "extract_then_synthesize"]

_MAX_FOCUS_QUERY_CHARS = 300
_MAX_EXTRA_INSTRUCTIONS_CHARS = 2000

# Density-slider calibration for the "scaled_to_input" length policy: target_words =
# A_LOW * (A_HIGH/A_LOW)**slider * input_words**0.2, geometric interpolation of the
# coefficient so each slider step is a constant percentage change in density. See
# .scratch/claude_plans/dlugosc-i-rejestr-podsumowan-analiza.md (Aneks C) for the derivation.
# TODO ADR i wywalic ten komentarz
SCALED_LENGTH_EXPONENT = 0.2
SCALED_LENGTH_A_LOW = 4.8
SCALED_LENGTH_A_HIGH = 66.0
SCALED_LENGTH_FLOOR_WORDS = 8
# Cost/safety ceiling, unrelated to the content-quality curve above — the curve alone
# already self-limits for realistic input sizes (see Aneks C.5).
SCALED_LENGTH_SAFETY_CEILING_WORDS = 3000

_WORDS_PER_SENTENCE = 20
_MIN_SENTENCES = 1
_MAX_SENTENCES = 20


class ExplicitLength(BaseModel):
    policy: Literal["explicit"] = "explicit"
    target_words: int | None = Field(default=None, ge=1, le=SCALED_LENGTH_SAFETY_CEILING_WORDS)
    target_sentences: int | None = Field(default=None, ge=1, le=50)


class ScaledLength(BaseModel):
    policy: Literal["scaled_to_input"] = "scaled_to_input"
    slider: float = Field(ge=0.0, le=1.0)


class MatchReferenceLength(BaseModel):
    """Evaluation-only: target_words/target_sentences are derived from a golden_summary at
    resolve time, not stored here. tolerance_pct is not consumed by resolve_target_length —
    it is metadata for later metrics/reporting on how far actual output drifted from the
    (exactly-matched) target, not an input to generation.
    """

    policy: Literal["match_reference"] = "match_reference"
    tolerance_pct: float = Field(default=15.0, ge=0.0, le=100.0)


LengthSpec = Annotated[
    ExplicitLength | ScaledLength | MatchReferenceLength,
    Field(discriminator="policy"),
]


class SummarySpec(BaseModel):
    narrative_stance: NarrativeStance = "voice_of_document"
    summary_function: SummaryFunction = "informative"
    output_format: OutputFormat = "prose"
    length: LengthSpec = Field(default_factory=ExplicitLength)
    focus_query: str | None = Field(default=None, max_length=_MAX_FOCUS_QUERY_CHARS)
    extra_instructions: str | None = Field(default=None, max_length=_MAX_EXTRA_INSTRUCTIONS_CHARS)


def _sentences_for(words: int) -> int:
    return max(_MIN_SENTENCES, min(_MAX_SENTENCES, round(words / _WORDS_PER_SENTENCE)))


def resolve_target_length(
    length: LengthSpec, *, input_words: int, golden_summary: str | None
) -> tuple[int, int]:
    """-> (target_words, target_sentences), always concrete numbers regardless of policy."""
    if isinstance(length, ExplicitLength):
        if length.target_words is None:
            raise ValueError("ExplicitLength.target_words must be set to resolve a length")
        words = length.target_words
        sentences = (
            length.target_sentences
            if length.target_sentences is not None
            else _sentences_for(words)
        )
        return words, sentences

    if isinstance(length, ScaledLength):
        coefficient = (
            SCALED_LENGTH_A_LOW * (SCALED_LENGTH_A_HIGH / SCALED_LENGTH_A_LOW) ** length.slider
        )
        words = round(coefficient * input_words**SCALED_LENGTH_EXPONENT)
        words = max(SCALED_LENGTH_FLOOR_WORDS, min(SCALED_LENGTH_SAFETY_CEILING_WORDS, words))
        return words, _sentences_for(words)

    if isinstance(length, MatchReferenceLength):
        if golden_summary is None:
            raise ValueError("match_reference length policy requires a golden_summary")
        words = len(golden_summary.split())
        sentence_fragments = [
            s for s in _SENTENCE_SPLIT_RE.split(golden_summary.strip()) if s.strip()
        ]
        sentences = max(_MIN_SENTENCES, len(sentence_fragments))
        return words, sentences

    raise NotImplementedError(f"Unhandled length policy: {length!r}")
