"""Cases cs26-cs31: judge agreement with the author's labels, and the score-by-degree curve."""

import pytest

from app.services.calibration_files import Negative, NegativeExpectation
from calibration.report import degree_curve, true_positive_and_negative_rates


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
