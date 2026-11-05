"""Step 6: compare every candidate's verdicts with the author's labels and write report.md."""

from __future__ import annotations

from dataclasses import dataclass

from .files import Negative


@dataclass(frozen=True, slots=True)
class JudgeAgreement:
    # Of the atoms the author marked good, the share the judge also marked good.
    true_positive_rate: float
    # Of the atoms the author marked bad, the share the judge also caught.
    true_negative_rate: float
    positives: int
    negatives: int


@dataclass(frozen=True, slots=True)
class DegreePoint:
    degree: str
    mean_score: float
    negatives: int


def true_positive_and_negative_rates(
    labels: list[bool | None], predictions: list[bool]
) -> JudgeAgreement:
    """Atoms the author marked unclear (None) are left out."""
    raise NotImplementedError


def degree_curve(
    scores_by_negative_id: dict[str, float], negatives: list[Negative]
) -> list[DegreePoint]:
    raise NotImplementedError


def main() -> None:
    raise NotImplementedError


if __name__ == "__main__":
    main()
