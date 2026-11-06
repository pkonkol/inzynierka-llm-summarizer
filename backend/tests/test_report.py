"""Cases cs26-cs31 and review rv4, rv6: judge agreement with the author's labels, the score-by-degree curve, and what a split's report counts."""

import pytest

from app.schemas.calibration_api import (
    CalibrationLabels,
    CalibrationSample,
    CalibrationSource,
    CalibrationSummary,
    PairVerdict,
)
from app.services.calibration_files import (
    CandidatePredictions,
    JudgedItem,
    Negative,
    NegativeExpectation,
    PairPrediction,
)
from calibration.report import (
    _candidate_section,
    _item_atoms,
    _Truth,
    degree_curve,
    true_positive_and_negative_rates,
)


def test_case_26_rates_from_labels_and_predictions() -> None:
    agreement = true_positive_and_negative_rates(
        [True, True, False, False], [True, False, False, True]
    )

    assert agreement.true_positive_rate == pytest.approx(0.5)
    assert agreement.true_negative_rate == pytest.approx(0.5)
    assert agreement.positives == 2
    assert agreement.negatives == 2


def test_case_27_unclear_labels_are_left_out() -> None:
    agreement = true_positive_and_negative_rates(
        [True, None, False, None], [True, False, False, True]
    )

    assert agreement.true_positive_rate == pytest.approx(1.0)
    assert agreement.true_negative_rate == pytest.approx(1.0)
    assert agreement.positives == 1
    assert agreement.negatives == 1


def test_case_28_subset_without_fails_has_no_true_negative_rate() -> None:
    agreement = true_positive_and_negative_rates([True, True], [True, False])

    assert agreement.true_positive_rate == pytest.approx(0.5)
    assert agreement.true_negative_rate is None
    assert agreement.negatives == 0


def test_case_29_lists_of_different_length_are_rejected() -> None:
    with pytest.raises(ValueError):
        true_positive_and_negative_rates([True, False], [True])


def _negative(negative_id: str, degree: str) -> Negative:
    return Negative(
        negative_id=negative_id,
        base_summary_id="summary-1",
        kind="false_fact",
        degree=degree,
        generator_model="anthropic/claude-sonnet",
        sentences=["Alpha rose."],
        expected=NegativeExpectation(
            sentence_faithful=[False],
            sentence_carries_keyfact=[None],
            keyfact_present=[],
            coherent=True,
            has_repetition=None,
        ),
    )


def test_case_30_mean_score_per_degree_from_lightest_to_whole() -> None:
    negatives = [
        _negative("whole-1", "whole"),
        _negative("half-1", "half"),
        _negative("one-1", "one_sentence"),
        _negative("one-2", "one_sentence"),
        _negative("two-1", "two_sentences"),
    ]
    scores = {"whole-1": 0.0, "half-1": 0.5, "one-1": 0.9, "one-2": 0.7, "two-1": 0.6}

    curve = degree_curve(scores, negatives)

    assert [point.degree for point in curve] == ["one_sentence", "two_sentences", "half", "whole"]
    assert [point.mean_score for point in curve] == pytest.approx([0.8, 0.6, 0.5, 0.0])
    assert [point.negatives for point in curve] == [2, 1, 1, 1]


def test_case_31_negative_without_a_judge_score_is_an_error() -> None:
    negatives = [_negative("one-1", "one_sentence"), _negative("one-2", "one_sentence")]

    with pytest.raises((KeyError, ValueError)):
        degree_curve({"one-1": 0.9}, negatives)


def _source(source_id: str, split: str) -> CalibrationSource:
    return CalibrationSource(
        source_id=source_id,
        set_name="cnn_dailymail",
        language="en",
        entry_id=source_id,
        input_text="Alpha rose.",
        keyfacts=["Alpha rose."],
        keyfacts_approved=True,
        split=split,
    )


def _summary(source_id: str, origin: str) -> CalibrationSummary:
    return CalibrationSummary(
        summary_id=f"{source_id}-{origin}",
        source_id=source_id,
        origin=origin,
        generator_model=None if origin == "golden" else "qwen/qwen3.8-flash",
        processing_strategy=None if origin == "golden" else "direct",
        text="Alpha rose.",
        sentences=["Alpha rose."],
    )


def test_rv4_report_of_a_split_counts_only_its_own_pairs() -> None:
    sample = CalibrationSample(
        sources=[_source("dev-source", "dev"), _source("test-source", "test")],
        summaries=[
            _summary(source_id, origin)
            for source_id in ("dev-source", "test-source")
            for origin in ("golden", "ai")
        ],
    )
    labels = CalibrationLabels(
        pairs={
            source_id: PairVerdict(better_summary_id=f"{source_id}-ai")
            for source_id in ("dev-source", "test-source")
        }
    )
    candidate = CandidatePredictions(
        judge_model="openrouter:deepseek/deepseek-v4-pro-0813",
        prompt_version="v1",
        pairs={
            source_id: PairPrediction(
                source_id=source_id, preferred="ai", score=0.8, consistent=True
            )
            for source_id in ("dev-source", "test-source")
        },
    )

    report = "\n".join(_candidate_section(candidate, "test", sample, labels, []))

    assert "pairs judged 1," in report


def test_rv6_unusable_answer_is_wrong_on_repetition_too() -> None:
    truth = _Truth(
        origin="negative",
        family="anthropic",
        sentence_faithful=[True],
        sentence_carries_keyfact=[True],
        keyfact_present=[True],
        coherent=True,
        has_repetition=True,
    )
    item = JudgedItem(
        item_id="summary-1-duplicate-one_sentence",
        split="dev",
        origin="negative",
        fact_level=None,
        coherence=None,
        error="unparseable",
    )

    atoms = {atom.metric: atom for atom in _item_atoms(truth, item, "deepseek")}

    assert atoms["no repetition"].label is False
    assert atoms["no repetition"].prediction is True
