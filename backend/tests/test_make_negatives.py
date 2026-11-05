"""Cases cs20-cs25: the diff check that a perturbation touched only the sentences it was asked to."""

import pytest

from calibration.make_negatives import changed_sentences_match

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
