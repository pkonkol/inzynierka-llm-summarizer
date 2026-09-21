# schemas/summary_spec.py — structured contract for what a summary should look like

import re
from typing import Annotated, Literal

from pydantic import BaseModel, Field

_SENTENCE_SPLIT_RE = re.compile(r"[.!?]+")

NarrativeStance = Literal["about_document", "voice_of_document"]
SummaryFunction = Literal["indicative", "informative", "mixed"]
OutputFormat = Literal["prose", "bullets"]
ProcessingStrategy = Literal["direct", "extract_then_synthesize"]

_MAX_EXTRA_INSTRUCTIONS_CHARS = 2000

# Density-slider calibration for the "scaled_to_input" length policy: target_words =
# A_LOW * (A_HIGH/A_LOW)**slider * input_words**0.2, geometric interpolation of the
# coefficient so each slider step is a constant percentage change in density. See
# .scratch/claude_plans/dlugosc-i-rejestr-podsumowan-analiza.md (Aneks C) for the derivation,
# and docs/adr/0003-summary-spec-and-processing-strategy.md for why this lives on SummarySpec.
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
    target_words: int = Field(ge=1, le=SCALED_LENGTH_SAFETY_CEILING_WORDS)
    target_sentences: int | None = Field(default=None, ge=1, le=50)


class ScaledLength(BaseModel):
    """max_sentences pins the sentence count instead of deriving it from the words, and
    words_multiplier shrinks the whole word range: a one-sentence summary still gets a slider,
    but over roughly a tenth of the words a multi-sentence one spans."""

    policy: Literal["scaled_to_input"] = "scaled_to_input"
    slider: float = Field(ge=0.0, le=1.0)
    max_sentences: int | None = Field(default=None, ge=_MIN_SENTENCES, le=_MAX_SENTENCES)
    words_multiplier: float = Field(default=1.0, gt=0.0, le=1.0)


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
    length: LengthSpec = Field(default_factory=lambda: ScaledLength(slider=0.5))
    extra_instructions: str | None = Field(default=None, max_length=_MAX_EXTRA_INSTRUCTIONS_CHARS)


class ResolvedLength(BaseModel):
    target_words: int
    target_sentences: int


def _sentences_for(words: int) -> int:
    return max(_MIN_SENTENCES, min(_MAX_SENTENCES, round(words / _WORDS_PER_SENTENCE)))


def resolve_target_length(
    length: LengthSpec, *, input_words: int, golden_summary: str | None
) -> ResolvedLength:
    if isinstance(length, ExplicitLength):
        words = length.target_words
        sentences = length.target_sentences or _sentences_for(words)
        return ResolvedLength(target_words=words, target_sentences=sentences)

    if isinstance(length, ScaledLength):
        coefficient = (
            SCALED_LENGTH_A_LOW * (SCALED_LENGTH_A_HIGH / SCALED_LENGTH_A_LOW) ** length.slider
        )
        words = round(length.words_multiplier * coefficient * input_words**SCALED_LENGTH_EXPONENT)
        words = max(SCALED_LENGTH_FLOOR_WORDS, min(SCALED_LENGTH_SAFETY_CEILING_WORDS, words))
        return ResolvedLength(
            target_words=words,
            target_sentences=length.max_sentences or _sentences_for(words),
        )

    if isinstance(length, MatchReferenceLength):
        if golden_summary is None:
            raise ValueError("match_reference length policy requires a golden_summary")
        words = len(golden_summary.split())
        sentence_fragments = [
            s for s in _SENTENCE_SPLIT_RE.split(golden_summary.strip()) if s.strip()
        ]
        return ResolvedLength(
            target_words=words, target_sentences=max(_MIN_SENTENCES, len(sentence_fragments))
        )

    raise NotImplementedError(f"Unhandled length policy: {length!r}")
