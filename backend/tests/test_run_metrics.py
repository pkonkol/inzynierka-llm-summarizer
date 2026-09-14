import pytest

from app.services.run_metrics import evaluated_output_text


def test_prose_output_is_judged_as_the_summary_itself() -> None:
    assert evaluated_output_text("A summary.", None) == "A summary."


def test_bullets_output_is_judged_as_the_joined_points() -> None:
    assert evaluated_output_text(None, ["first", "second"]) == "- first\n- second"


def test_a_result_with_neither_output_is_a_bug() -> None:
    with pytest.raises(ValueError, match="neither"):
        evaluated_output_text(None, None)
