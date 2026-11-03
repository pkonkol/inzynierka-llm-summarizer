"""Case cs26a: an evaluation set may hold fresh pages without a reference summary."""

from app.schemas.evaluation_set_api import EvaluationSetEntryImport


def test_case_26a_entry_without_golden_summary_is_accepted() -> None:
    entry = EvaluationSetEntryImport.model_validate(
        {"input_text": "Fresh page text.", "title": "Fresh", "url": "https://fresh.example/"}
    )

    assert entry.golden_summary is None
