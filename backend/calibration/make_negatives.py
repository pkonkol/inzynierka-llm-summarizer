"""Step 3: perturb labelled summaries with an LLM outside the judge candidates, and stage each one in review/ for `git add -p`."""

from __future__ import annotations

from enum import StrEnum

from app.schemas.calibration_api import CalibrationSummary


class NegativeKind(StrEnum):
    FALSE_FACT = "false_fact"
    REMOVED_SENTENCE = "removed_sentence"
    FILLER = "filler"
    DUPLICATE = "duplicate"
    FOREIGN_SENTENCES = "foreign_sentences"
    PARAPHRASE = "paraphrase"  # invariance check: every verdict should stay the same


class NegativeDegree(StrEnum):
    ONE_SENTENCE = "one_sentence"
    TWO_SENTENCES = "two_sentences"
    HALF = "half"
    WHOLE = "whole"  # summary of a different source, as a control


async def perturb(
    summary: CalibrationSummary, kind: NegativeKind, degree: NegativeDegree
) -> list[str]:
    raise NotImplementedError


def changed_sentences_match(original: list[str], perturbed: list[str], expected: set[int]) -> bool:
    """Diff check: only the sentences the perturbation was asked to touch differ."""
    raise NotImplementedError


def main() -> None:
    raise NotImplementedError


if __name__ == "__main__":
    main()
