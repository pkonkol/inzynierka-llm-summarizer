from unittest.mock import AsyncMock

import pytest

from app.schemas.evaluation_run_api import EvaluationRunCreateRequest
from app.schemas.summary import LlmSummaryResult, UsageMetadata
from app.schemas.summary_spec import SummarySpec
from app.services import evaluation_runner
from app.services.evaluation_runner import summarize_entry_statuses


def test_all_completed_is_a_completed_run() -> None:
    assert summarize_entry_statuses(["completed", "completed"]) == ("completed", 2, 2, 0)


def test_a_single_failure_does_not_fail_the_run() -> None:
    run_status, entry_count, completed, failed = summarize_entry_statuses(
        ["completed", "failed", "completed"]
    )
    assert run_status == "completed"
    assert (entry_count, completed, failed) == (3, 2, 1)


def test_a_run_where_nothing_succeeded_is_failed() -> None:
    assert summarize_entry_statuses(["failed", "failed"]) == ("failed", 2, 0, 2)


def test_counts_cover_every_entry_including_a_resumed_run() -> None:
    # The whole point of counting from the document: after a resume the loop only touched the
    # entries that were still outstanding, so a per-invocation count would report 1 of 1.
    _, entry_count, completed, _ = summarize_entry_statuses(["completed", "completed", "completed"])
    assert (entry_count, completed) == (3, 3)


_SOURCE_ENTRY = {"input_text": "word " * 500, "title": "T", "url": "https://example.com/a"}
_GOLDEN = "One sentence here. And a second one."


def _llm_result(summary: str | None, key_takeaways: list[str] | None) -> LlmSummaryResult:
    return LlmSummaryResult(
        title="T",
        summary=summary,
        key_takeaways=key_takeaways,
        output_format="prose" if summary is not None else "bullets",
        source_url="https://example.com/a",
        usage=UsageMetadata(),
        raw_metadata={},
        raw_output="",
        input_text="",
        prompt_template=[],
        prompt_params={},
    )


@pytest.fixture
def mocked_entry_pipeline(monkeypatch: pytest.MonkeyPatch) -> dict[str, AsyncMock]:
    mocks = {
        "fetch_source_entry": AsyncMock(return_value=_SOURCE_ENTRY),
        "generate_summary": AsyncMock(return_value=_llm_result("AI summary.", None)),
        "compute_statistical_metrics": AsyncMock(return_value={}),
        "compute_cross_metrics": AsyncMock(return_value={}),
    }
    for name, mock in mocks.items():
        monkeypatch.setattr(evaluation_runner, name, mock)
    return mocks


def _run_doc(spec: SummarySpec) -> dict:
    return {
        "_id": "run",
        "evaluation_set_id": "set",
        "model_name": "m",
        "model_provider": "p",
        "language": "en",
        "processing_strategy": "extract_then_synthesize",
        "summary_spec": spec.model_dump(),
    }


def test_a_new_run_matches_the_reference_length_by_default() -> None:
    request = EvaluationRunCreateRequest(model_provider="p", model_name="m")
    assert request.summary_spec.length.policy == "match_reference"


@pytest.mark.parametrize(
    ("length", "expected"),
    [
        pytest.param({"policy": "match_reference"}, (7, 2), id="match-reference"),
        pytest.param({"policy": "explicit", "target_words": 40}, (40, 2), id="explicit"),
        pytest.param({"policy": "scaled_to_input", "slider": 0.0}, (17, 1), id="scaled"),
    ],
)
async def test_each_length_policy_reaches_the_model_as_a_resolved_length(
    mocked_entry_pipeline: dict[str, AsyncMock], length: dict, expected: tuple[int, int]
) -> None:
    spec = SummarySpec.model_validate({"length": length})

    result = await evaluation_runner._summarize_one_entry(
        _run_doc(spec), {"entry_id": "e", "golden_summary": _GOLDEN}
    )

    passed_length = mocked_entry_pipeline["generate_summary"].call_args.kwargs["length"]
    assert (passed_length.target_words, passed_length.target_sentences) == expected
    assert result["resolved_length"] == {
        "target_words": expected[0],
        "target_sentences": expected[1],
    }
    assert mocked_entry_pipeline["generate_summary"].call_args.kwargs["strategy"] == (
        "extract_then_synthesize"
    )


async def test_bullets_output_is_judged_against_the_reference_as_joined_points(
    mocked_entry_pipeline: dict[str, AsyncMock],
) -> None:
    mocked_entry_pipeline["generate_summary"].return_value = _llm_result(None, ["a", "b"])
    spec = SummarySpec.model_validate(
        {"output_format": "bullets", "length": {"policy": "explicit", "target_words": 30}}
    )

    result = await evaluation_runner._summarize_one_entry(
        _run_doc(spec), {"entry_id": "e", "golden_summary": _GOLDEN}
    )

    assert result["status"] == "completed"
    assert result["ai_key_takeaways"] == ["a", "b"]
    cross_kwargs = mocked_entry_pipeline["compute_cross_metrics"].call_args.kwargs
    assert cross_kwargs["summary_text"] == "- a\n- b"
