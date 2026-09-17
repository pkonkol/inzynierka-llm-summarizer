import pytest
from pydantic import TypeAdapter, ValidationError

from app.schemas.summary_spec import (
    SCALED_LENGTH_A_HIGH,
    SCALED_LENGTH_A_LOW,
    SCALED_LENGTH_SAFETY_CEILING_WORDS,
    ExplicitLength,
    LengthSpec,
    MatchReferenceLength,
    ResolvedLength,
    ScaledLength,
    SummarySpec,
    resolve_target_length,
)

_length_adapter: TypeAdapter = TypeAdapter(LengthSpec)


def test_each_length_policy_round_trips_through_the_discriminated_union() -> None:
    assert isinstance(
        _length_adapter.validate_python({"policy": "explicit", "target_words": 50}), ExplicitLength
    )
    assert isinstance(
        _length_adapter.validate_python({"policy": "scaled_to_input", "slider": 0.5}), ScaledLength
    )
    assert isinstance(
        _length_adapter.validate_python({"policy": "match_reference"}), MatchReferenceLength
    )


def test_an_unknown_policy_is_rejected() -> None:
    with pytest.raises(ValidationError):
        _length_adapter.validate_python({"policy": "guess"})


def test_explicit_length_derives_sentences_when_only_words_are_given() -> None:
    resolved = resolve_target_length(
        ExplicitLength(target_words=100), input_words=500, golden_summary=None
    )
    assert resolved == ResolvedLength(target_words=100, target_sentences=5)  # round(100/20)


def test_explicit_length_keeps_an_explicitly_given_sentence_count() -> None:
    resolved = resolve_target_length(
        ExplicitLength(target_words=100, target_sentences=1), input_words=500, golden_summary=None
    )
    assert resolved == ResolvedLength(target_words=100, target_sentences=1)


def test_explicit_length_without_target_words_is_rejected() -> None:
    with pytest.raises(ValidationError, match="target_words"):
        _length_adapter.validate_python({"policy": "explicit"})


def test_a_spec_without_a_length_scales_to_the_input() -> None:
    assert SummarySpec().length == ScaledLength(slider=0.5)


def test_scaled_length_at_slider_zero_uses_the_low_coefficient() -> None:
    words = resolve_target_length(
        ScaledLength(slider=0.0), input_words=300, golden_summary=None
    ).target_words
    assert words == round(SCALED_LENGTH_A_LOW * 300**0.2)


def test_scaled_length_at_slider_one_uses_the_high_coefficient() -> None:
    words = resolve_target_length(
        ScaledLength(slider=1.0), input_words=300, golden_summary=None
    ).target_words
    assert words == round(SCALED_LENGTH_A_HIGH * 300**0.2)


def test_scaled_length_is_clamped_to_the_safety_ceiling_for_huge_inputs() -> None:
    # The curve grows so slowly (exponent 0.2) that only a pathologically large input reaches
    # the ceiling at all — see Aneks C.4/C.5 in the length/register design notes.
    words = resolve_target_length(
        ScaledLength(slider=1.0), input_words=10**9, golden_summary=None
    ).target_words
    assert words == SCALED_LENGTH_SAFETY_CEILING_WORDS


def test_match_reference_length_counts_the_golden_summarys_own_words_and_sentences() -> None:
    golden = "Lehman Brothers collapsed in 2008. It triggered a global credit freeze."
    resolved = resolve_target_length(MatchReferenceLength(), input_words=999, golden_summary=golden)
    assert resolved == ResolvedLength(target_words=len(golden.split()), target_sentences=2)


def test_match_reference_length_requires_a_golden_summary() -> None:
    with pytest.raises(ValueError, match="golden_summary"):
        resolve_target_length(MatchReferenceLength(), input_words=999, golden_summary=None)
