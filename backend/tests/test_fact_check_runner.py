"""Cases cs4-cs9 (E8b1): the fact check that runs after a job's summary is stored."""

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.schemas.context_expansion import ContextExpansionResult, RelatedSource
from app.schemas.fact_check import LlmAssessmentResult
from app.schemas.usage import UsageMetadata
from app.services import fact_check_runner
from app.services.context_expansion import ContextExpansionError
from app.services.llm import LlmOutputError

SOURCE_TEXT = "The source article claims that coffee cures colds."
ASSESSMENT_TEXT = "According to [1], coffee does not cure colds."
SUMMARY_DATA = {
    "title": "Coffee",
    "summary": "Coffee cures colds.",
    "source_url": "https://a.example/",
}


def _completed_job() -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "job_id": "j",
        "source_url": "https://a.example/",
        "model_provider": "gemini",
        "model_name": "gemini-3.8-flash",
        "language": "en",
        "origin": "public",
        "status": "completed",
        "summary_data": SUMMARY_DATA,
        "resolved_length": {"target_words": 120, "target_sentences": 6},
        "fact_check": {
            "status": "pending",
            "text": None,
            "sources": [],
            "context_expansion": None,
            "usage": None,
            "duration_ms": None,
            "error": None,
        },
        "created_at": now,
    }


def _related(index: int) -> RelatedSource:
    return RelatedSource(
        channel="web",
        url=f"https://related{index}.example/",
        title=f"Related {index}",
        excerpt="Coffee has no effect on colds.",
        selection_reason="contradicts the claim",
    )


def _expansion(selected: list[RelatedSource]) -> ContextExpansionResult:
    return ContextExpansionResult(
        mode="staged",
        channels=[],
        candidate_count=len(selected),
        selected=selected,
        usage=UsageMetadata(total_tokens=50),
        duration_ms=10,
    )


def _fact_check_state(collection: AsyncMock) -> dict[str, Any]:
    """Folds every $set the runner sent into the job's fact_check, whether written whole or by dotted path."""
    state: dict[str, Any] = dict(_completed_job()["fact_check"])
    for call in collection.update_one.call_args_list:
        for key, value in call.args[1]["$set"].items():
            if key == "fact_check":
                state = dict(value)
            elif key.startswith("fact_check."):
                state[key.removeprefix("fact_check.")] = value
    return state


def _fields_outside_fact_check(collection: AsyncMock) -> set[str]:
    return {
        key
        for call in collection.update_one.call_args_list
        for key in call.args[1]["$set"]
        if key != "fact_check" and not key.startswith("fact_check.")
    }


@pytest.fixture
def jobs_collection(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    collection = AsyncMock()
    collection.find_one.return_value = _completed_job()
    monkeypatch.setattr(fact_check_runner, "get_jobs_collection", lambda: collection, raising=False)
    return collection


@pytest.fixture
def assess(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    generate = AsyncMock(
        return_value=LlmAssessmentResult(
            text=ASSESSMENT_TEXT, usage=UsageMetadata(total_tokens=300), raw_output=ASSESSMENT_TEXT
        )
    )
    monkeypatch.setattr(fact_check_runner, "generate_assessment", generate, raising=False)
    return generate


def _search_returning(monkeypatch: pytest.MonkeyPatch, **mock_kwargs: object) -> AsyncMock:
    search = AsyncMock(**mock_kwargs)  # pyrefly: ignore
    monkeypatch.setattr(fact_check_runner, "expand_context", search, raising=False)
    return search


async def test_case_4_completed_fact_check_stores_text_and_sources(
    jobs_collection: AsyncMock, assess: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    expansion = _expansion([_related(1), _related(2)])
    search = _search_returning(monkeypatch, return_value=expansion)

    await fact_check_runner.run_fact_check("j", SOURCE_TEXT)

    assert search.await_args.args[:3] == (SOURCE_TEXT, "https://a.example/", "staged")
    request = assess.await_args.args[0]
    assert request.text == SOURCE_TEXT
    assert request.related_sources == expansion.selected
    assert (request.model_provider, request.model_name) == ("gemini", "gemini-3.8-flash")

    state = _fact_check_state(jobs_collection)
    assert state["status"] == "completed"
    assert state["text"] == ASSESSMENT_TEXT
    assert state["sources"] == [source.model_dump() for source in expansion.selected]
    assert state["context_expansion"] == expansion.model_dump()
    assert state["usage"]["total_tokens"] == 300
    assert isinstance(state["duration_ms"], int)
    assert state["error"] is None
    assert _fields_outside_fact_check(jobs_collection) <= {"updated_at"}


async def test_case_5_fact_check_is_running_while_the_search_runs(
    jobs_collection: AsyncMock, assess: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    status_during_search: list[str] = []

    async def search(*_args: object) -> ContextExpansionResult:
        status_during_search.append(_fact_check_state(jobs_collection)["status"])
        return _expansion([_related(1)])

    monkeypatch.setattr(fact_check_runner, "expand_context", search, raising=False)

    await fact_check_runner.run_fact_check("j", SOURCE_TEXT)

    assert status_during_search == ["running"]


async def test_case_6_assessment_gets_the_summary_target_words(
    jobs_collection: AsyncMock, assess: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    _search_returning(monkeypatch, return_value=_expansion([_related(1)]))

    await fact_check_runner.run_fact_check("j", SOURCE_TEXT)

    assert assess.await_args.args[0].target_words == 120


async def test_case_7_no_selected_sources_completes_without_llm_call(
    jobs_collection: AsyncMock, assess: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    _search_returning(monkeypatch, return_value=_expansion([]))

    await fact_check_runner.run_fact_check("j", SOURCE_TEXT)

    assess.assert_not_awaited()
    state = _fact_check_state(jobs_collection)
    assert state["status"] == "completed"
    assert state["text"] == fact_check_runner.NO_SOURCES_TEXT
    assert state["sources"] == []


@pytest.mark.parametrize(
    "broken_step",
    [
        pytest.param("search", id="case_8_search_fails"),
        pytest.param("assessment", id="case_9_assessment_fails"),
    ],
)
async def test_case_8_9_failure_marks_fact_check_failed_and_keeps_summary(
    jobs_collection: AsyncMock,
    assess: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
    broken_step: str,
) -> None:
    if broken_step == "search":
        _search_returning(monkeypatch, side_effect=ContextExpansionError("all channels failed"))
    else:
        _search_returning(monkeypatch, return_value=_expansion([_related(1)]))
        assess.side_effect = LlmOutputError("unparseable assessment", raw_output="{")

    await fact_check_runner.run_fact_check("j", SOURCE_TEXT)

    state = _fact_check_state(jobs_collection)
    assert state["status"] == "failed"
    assert state["error"]
    assert state["text"] is None
    assert _fields_outside_fact_check(jobs_collection) <= {"updated_at"}
