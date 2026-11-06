"""Cases cs20-cs25 and review rv1-rv2: the diff check that a perturbation touched only the sentences it was asked to, and the whole-summary controls."""

import random

import pytest

from app.schemas.calibration_api import (
    CalibrationLabels,
    CalibrationSample,
    CalibrationSource,
    CalibrationSummary,
    SentenceLabel,
    SummaryLabels,
)
from calibration.make_negatives import changed_sentences_match, whole_controls

ORIGINAL = ["Alpha rose.", "Beta fell.", "Gamma held."]


@pytest.mark.parametrize(
    ("perturbed", "expected", "matches"),
    [
        pytest.param(
            ["Alpha rose.", "Beta soared.", "Gamma held."], {1}, True, id="case_20_only_expected"
        ),
        pytest.param(
            ["Alpha sank.", "Beta soared.", "Gamma held."], {1}, False, id="case_21_extra_change"
        ),
        pytest.param(list(ORIGINAL), {1}, False, id="case_22_nothing_changed"),
        pytest.param(["Alpha rose.", "Gamma held."], {1}, True, id="case_23_removal"),
        pytest.param(
            ["Alpha rose.", "Delta appeared.", "Beta fell.", "Gamma held."],
            {1},
            True,
            id="case_24_insertion",
        ),
        pytest.param(
            ["Alpha rose.", " Beta fell. ", "Gamma dropped."],
            {2},
            True,
            id="case_25_edge_whitespace_is_no_change",
        ),
    ],
)
def test_changed_sentences_match(perturbed: list[str], expected: set[int], matches: bool) -> None:
    assert changed_sentences_match(ORIGINAL, perturbed, expected) is matches


def _summary(source_id: str, origin: str) -> CalibrationSummary:
    return CalibrationSummary(
        summary_id=f"{source_id}-{origin}",
        source_id=source_id,
        origin=origin,
        generator_model=None if origin == "golden" else "qwen/qwen3.8-flash",
        processing_strategy=None if origin == "golden" else "direct",
        text=f"{source_id} {origin}.",
        sentences=[f"{source_id} {origin}."],
    )


def _sample(source_count: int) -> CalibrationSample:
    source_ids = [f"source-{index}" for index in range(source_count)]
    return CalibrationSample(
        sources=[
            CalibrationSource(
                source_id=source_id,
                set_name="cnn_dailymail",
                language="en",
                entry_id=source_id,
                input_text="Alpha rose.",
                keyfacts=["Alpha rose.", "Beta fell."],
                keyfacts_approved=True,
                split="dev",
            )
            for source_id in source_ids
        ],
        summaries=[
            _summary(source_id, origin) for source_id in source_ids for origin in ("golden", "ai")
        ],
    )


def _labels(summary_ids: list[str]) -> CalibrationLabels:
    return CalibrationLabels(
        summaries={
            summary_id: SummaryLabels(
                sentences=[SentenceLabel(faithful=True, carries_keyfact=True)],
                keyfacts_present=[True, False],
                coherent=True,
            )
            for summary_id in summary_ids
        }
    )


def test_rv1_every_source_gets_another_sources_golden_summary() -> None:
    sample = _sample(12)
    labels = _labels([f"source-{index}-ai" for index in range(12)])

    controls = whole_controls(sample, labels, random.Random(2026))
    again = whole_controls(sample, labels, random.Random(2026))

    assert len(controls) == 12
    assert controls == again
    for negative, original in controls:
        base_source = negative.base_summary_id.removesuffix("-ai")
        assert original == [f"{base_source} ai."]
        assert negative.sentences[0].endswith(" golden.")
        assert not negative.sentences[0].startswith(f"{base_source} ")
        assert negative.expected.keyfact_present == [False, False]


def test_rv2_unlabelled_source_stops_before_any_model_call() -> None:
    sample = _sample(3)
    labels = _labels(["source-0-ai", "source-1-golden"])

    with pytest.raises(SystemExit, match="source-2"):
        whole_controls(sample, labels, random.Random(2026))
