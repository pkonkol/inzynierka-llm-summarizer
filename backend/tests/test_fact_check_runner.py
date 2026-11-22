"""The fact check a visitor requests for a finished summary (E8b1 assessment, E8b2 fact-check channel)."""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.context_expansion import (
    ChannelOutcome,
    ClaimReview,
    ContextExpansionResult,
    RelatedSource,
)
from app.schemas.fact_check import FactCheckSearch, LlmAssessmentResult, SourceStance
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


def _fact_check_field(status: str, **overrides: object) -> dict[str, Any]:
    return {
        "status": status,
        "requested_at": datetime.now(UTC),
        "text": None,
        "sources": [],
        "context_expansion": None,
        "fact_check_search": None,
        "usage": None,
        "duration_ms": None,
        "error": None,
        **overrides,
    }


def _job(fact_check: dict[str, Any] | None, summary_status: str = "completed") -> dict[str, Any]:
    return {
        "job_id": "j",
        "source_url": "https://a.example/",
        "model_provider": "gemini",
        "model_name": "gemini-3.8-flash",
        "language": "en",
        "origin": "public",
        "status": summary_status,
        "context_expansion_mode": "none",
        "context_expansion": None,
        "summary_data": SUMMARY_DATA,
        "input_text": SOURCE_TEXT,
        "resolved_length": {"target_words": 120, "target_sentences": 6},
        "fact_check": fact_check,
        "created_at": datetime.now(UTC),
    }


def _completed_job() -> dict[str, Any]:
    return _job(_fact_check_field("pending"))


def _related(index: int, channel: str = "web", review: ClaimReview | None = None) -> RelatedSource:
    return RelatedSource(
        channel=channel,  # pyrefly: ignore
        url=f"https://related{index}.example/",
        title=f"Related {index}",
        excerpt="Coffee has no effect on colds.",
        selection_reason="contradicts the claim",
        review=review,
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


def _fact_check_search(claims: list[str]) -> FactCheckSearch:
    return FactCheckSearch(
        claims=claims,
        channels=[
            ChannelOutcome(
                channel="factcheck_google",
                queries=claims,
                result_count=1,
                duration_ms=5,
                cost_usd=None,
                error=None,
            )
        ],
        usage=UsageMetadata(total_tokens=20),
        duration_ms=7,
    )


def _assessment(stances: list[SourceStance]) -> LlmAssessmentResult:
    return LlmAssessmentResult(
        text=ASSESSMENT_TEXT,
        usage=UsageMetadata(total_tokens=300),
        raw_output=ASSESSMENT_TEXT,
        source_stances=stances,
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
    generate = AsyncMock(return_value=_assessment(["contradicts"]))
    monkeypatch.setattr(fact_check_runner, "generate_assessment", generate, raising=False)
    return generate


@pytest.fixture
def claim_search(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """The fact-check channels find nothing unless a test says otherwise."""
    search = AsyncMock(return_value=(_fact_check_search(["coffee cures colds"]), []))
    monkeypatch.setattr(fact_check_runner, "search_fact_checks", search, raising=False)
    return search


def _search_returning(monkeypatch: pytest.MonkeyPatch, **mock_kwargs: object) -> AsyncMock:
    search = AsyncMock(**mock_kwargs)  # pyrefly: ignore
    monkeypatch.setattr(fact_check_runner, "expand_context", search, raising=False)
    return search


async def test_case_4_completed_fact_check_stores_text_and_sources_with_stances(
    jobs_collection: AsyncMock,
    assess: AsyncMock,
    claim_search: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expansion = _expansion([_related(1), _related(2)])
    search = _search_returning(monkeypatch, return_value=expansion)
    assess.return_value = _assessment(["supports", "contradicts"])

    await fact_check_runner.run_fact_check("j")

    assert search.await_args.args[:3] == (SOURCE_TEXT, "https://a.example/", "staged")
    request = assess.await_args.args[0]
    assert request.text == SOURCE_TEXT
    assert request.related_sources == expansion.selected
    assert (request.model_provider, request.model_name) == ("gemini", "gemini-3.8-flash")

    state = _fact_check_state(jobs_collection)
    assert state["status"] == "completed"
    assert state["text"] == ASSESSMENT_TEXT
    assert [(source["url"], source["stance"]) for source in state["sources"]] == [
        ("https://related1.example/", "supports"),
        ("https://related2.example/", "contradicts"),
    ]
    assert state["context_expansion"] == expansion.model_dump()
    assert state["fact_check_search"] == claim_search.return_value[0].model_dump()
    assert state["usage"]["total_tokens"] >= 300
    assert isinstance(state["duration_ms"], int)
    assert state["error"] is None
    assert _fields_outside_fact_check(jobs_collection) <= {"updated_at"}


async def test_the_source_text_comes_from_the_job_input_text(
    jobs_collection: AsyncMock,
    assess: AsyncMock,
    claim_search: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    jobs_collection.find_one.return_value = {
        **_completed_job(),
        "input_text": "The full article text kept on the job.",
    }
    _search_returning(monkeypatch, return_value=_expansion([_related(1)]))

    await fact_check_runner.run_fact_check("j")

    assert claim_search.await_args.args[0] == "The full article text kept on the job."
    assert assess.await_args.args[0].text == "The full article text kept on the job."


async def test_fact_check_sources_come_before_general_sources(
    jobs_collection: AsyncMock,
    assess: AsyncMock,
    claim_search: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    review = ClaimReview(
        claim="Coffee cures colds.", publisher="PolitiFact", verdict="False", reviewed_at=None
    )
    fact_checks = [
        _related(10, channel="factcheck_google", review=review),
        _related(11, channel="factcheck_web"),
    ]
    claim_search.return_value = (_fact_check_search(["coffee cures colds"]), fact_checks)
    general = _expansion([_related(1), _related(2)])
    _search_returning(monkeypatch, return_value=general)
    assess.return_value = _assessment(["contradicts", "context", "supports", "context"])

    await fact_check_runner.run_fact_check("j")

    expected_order = [*fact_checks, *general.selected]
    assert assess.await_args.args[0].related_sources == expected_order
    state = _fact_check_state(jobs_collection)
    assert [source["url"] for source in state["sources"]] == [s.url for s in expected_order]
    assert [source["stance"] for source in state["sources"]] == [
        "contradicts",
        "context",
        "supports",
        "context",
    ]


async def test_case_5_fact_check_is_running_while_the_search_runs(
    jobs_collection: AsyncMock,
    assess: AsyncMock,
    claim_search: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    status_during_search: list[str] = []

    async def search(*_args: object) -> ContextExpansionResult:
        status_during_search.append(_fact_check_state(jobs_collection)["status"])
        return _expansion([_related(1)])

    monkeypatch.setattr(fact_check_runner, "expand_context", search, raising=False)

    await fact_check_runner.run_fact_check("j")

    assert status_during_search == ["running"]


async def test_case_6_assessment_gets_the_summary_target_words(
    jobs_collection: AsyncMock,
    assess: AsyncMock,
    claim_search: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _search_returning(monkeypatch, return_value=_expansion([_related(1)]))

    await fact_check_runner.run_fact_check("j")

    assert assess.await_args.args[0].target_words == 120


async def test_case_7_no_sources_at_all_completes_without_llm_call(
    jobs_collection: AsyncMock,
    assess: AsyncMock,
    claim_search: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _search_returning(monkeypatch, return_value=_expansion([]))

    await fact_check_runner.run_fact_check("j")

    assess.assert_not_awaited()
    state = _fact_check_state(jobs_collection)
    assert state["status"] == "completed"
    assert state["text"] == fact_check_runner.NO_SOURCES_TEXT
    assert state["sources"] == []
    assert state["fact_check_search"] is not None


async def test_fact_check_hits_alone_are_assessed(
    jobs_collection: AsyncMock,
    assess: AsyncMock,
    claim_search: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    hit = _related(10, channel="factcheck_web")
    claim_search.return_value = (_fact_check_search(["coffee cures colds"]), [hit])
    _search_returning(monkeypatch, return_value=_expansion([]))

    await fact_check_runner.run_fact_check("j")

    assert assess.await_args.args[0].related_sources == [hit]
    assert _fact_check_state(jobs_collection)["status"] == "completed"


@pytest.mark.parametrize(
    "broken_step",
    [
        pytest.param("search", id="case_8_search_fails"),
        pytest.param("fact_check_search", id="fact_check_search_fails"),
        pytest.param("assessment", id="case_9_assessment_fails"),
    ],
)
async def test_case_8_9_failure_marks_fact_check_failed_and_keeps_summary(
    jobs_collection: AsyncMock,
    assess: AsyncMock,
    claim_search: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
    broken_step: str,
) -> None:
    if broken_step == "search":
        _search_returning(monkeypatch, side_effect=ContextExpansionError("all channels failed"))
    elif broken_step == "fact_check_search":
        _search_returning(monkeypatch, return_value=_expansion([_related(1)]))
        claim_search.side_effect = ContextExpansionError("all channels failed")
    else:
        _search_returning(monkeypatch, return_value=_expansion([_related(1)]))
        assess.side_effect = LlmOutputError("unparseable assessment", raw_output="{")

    await fact_check_runner.run_fact_check("j")

    state = _fact_check_state(jobs_collection)
    assert state["status"] == "failed"
    assert (
        state["error"] == fact_check_runner.FAILED_MESSAGE
    )  # rv3: no provider detail reaches visitors
    assert state["text"] is None
    assert _fields_outside_fact_check(jobs_collection) <= {"updated_at"}


async def test_rv1_the_result_is_written_only_over_a_running_fact_check(
    jobs_collection: AsyncMock,
    assess: AsyncMock,
    claim_search: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _search_returning(monkeypatch, return_value=_expansion([_related(1)]))

    await fact_check_runner.run_fact_check("j")

    final_filter = jobs_collection.update_one.call_args_list[-1].args[0]
    assert final_filter == {"job_id": "j", "fact_check.status": "running"}


async def test_rv5_a_job_with_web_context_reuses_its_search(
    jobs_collection: AsyncMock,
    assess: AsyncMock,
    claim_search: AsyncMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stored = _expansion([_related(1), _related(2)])
    assess.return_value = _assessment(["context", "context"])
    jobs_collection.find_one.return_value = {
        **_completed_job(),
        "context_expansion_mode": "staged",
        "context_expansion": stored.model_dump(),
    }
    search = _search_returning(monkeypatch, side_effect=AssertionError("searched twice"))

    await fact_check_runner.run_fact_check("j")

    search.assert_not_awaited()
    assert assess.await_args.args[0].related_sources == stored.selected
    assert _fact_check_state(jobs_collection)["status"] == "completed"


class _JobsInMemory:
    """One job document behind the collection calls start_fact_check may use."""

    def __init__(self, job: dict[str, Any]) -> None:
        self.job = job

    def _matches(self, query: dict[str, Any]) -> bool:
        for key, condition in query.items():
            if key == "$or":
                if not any(self._matches(option) for option in condition):
                    return False
                continue
            value: Any = self.job
            for part in key.split("."):
                value = value.get(part) if isinstance(value, dict) else None
            if isinstance(condition, dict):
                if "$in" in condition and value not in condition["$in"]:
                    return False
                if "$nin" in condition and value in condition["$nin"]:
                    return False
                if "$ne" in condition and value == condition["$ne"]:
                    return False
            elif value != condition:
                return False
        return True

    def _apply(self, update: dict[str, Any]) -> None:
        for key, value in update.get("$set", {}).items():
            target = self.job
            *parents, last = key.split(".")
            for part in parents:
                target = target[part]
            target[last] = value

    async def find_one(
        self, query: dict[str, Any], *_args: object, **_kwargs: object
    ) -> dict[str, Any] | None:
        return self.job if self._matches(query) else None

    async def update_one(
        self, query: dict[str, Any], update: dict[str, Any], **_kwargs: object
    ) -> MagicMock:
        matched = self._matches(query)
        if matched:
            self._apply(update)
        return MagicMock(matched_count=int(matched), modified_count=int(matched))

    async def find_one_and_update(
        self, query: dict[str, Any], update: dict[str, Any], **_kwargs: object
    ) -> dict[str, Any] | None:
        if not self._matches(query):
            return None
        self._apply(update)
        return self.job


class _StartHarness:
    """Serves one job to start_fact_check and records each run_fact_check it spawns."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self.monkeypatch = monkeypatch
        self.runs: list[tuple[str, str]] = []  # (job_id, fact check status when the run began)
        self.jobs = _JobsInMemory({})
        monkeypatch.setattr(fact_check_runner, "run_fact_check", self._run_fact_check)

    async def _run_fact_check(self, job_id: str) -> None:
        self.runs.append((job_id, self.jobs.job["fact_check"]["status"]))

    def serve(self, job: dict[str, Any]) -> _JobsInMemory:
        self.jobs = _JobsInMemory(job)
        self.monkeypatch.setattr(
            fact_check_runner, "get_jobs_collection", lambda: self.jobs, raising=False
        )
        return self.jobs


@pytest.fixture
def start_harness(monkeypatch: pytest.MonkeyPatch) -> _StartHarness:
    return _StartHarness(monkeypatch)


async def _let_background_tasks_run() -> None:
    for _ in range(3):
        await asyncio.sleep(0)


async def test_start_marks_pending_and_spawns(start_harness: _StartHarness) -> None:
    jobs = start_harness.serve(_job(None))
    before = datetime.now(UTC)

    await fact_check_runner.start_fact_check("j")
    await _let_background_tasks_run()

    stored = jobs.job["fact_check"]
    assert stored["status"] == "pending"
    assert before <= stored["requested_at"] <= datetime.now(UTC)
    assert stored["text"] is None
    assert stored["sources"] == []
    assert start_harness.runs == [("j", "pending")]


@pytest.mark.parametrize("status", ["pending", "running", "completed"])
async def test_start_refuses_running_or_completed(
    start_harness: _StartHarness, status: str
) -> None:
    existing = _fact_check_field(status, requested_at=datetime.now(UTC) - timedelta(minutes=1))
    jobs = start_harness.serve(_job(dict(existing)))

    with pytest.raises(fact_check_runner.FactCheckNotAllowedError):
        await fact_check_runner.start_fact_check("j")
    await _let_background_tasks_run()

    assert jobs.job["fact_check"] == existing
    assert start_harness.runs == []


async def test_start_allows_retry_after_failure(start_harness: _StartHarness) -> None:
    first_request = datetime.now(UTC) - timedelta(hours=1)
    failed = _fact_check_field(
        "failed", requested_at=first_request, error=fact_check_runner.FAILED_MESSAGE
    )
    jobs = start_harness.serve(_job(failed))

    await fact_check_runner.start_fact_check("j")
    await _let_background_tasks_run()

    stored = jobs.job["fact_check"]
    assert stored["status"] == "pending"
    assert stored["requested_at"] > first_request
    assert stored["error"] is None
    assert start_harness.runs == [("j", "pending")]


@pytest.mark.parametrize("summary_status", ["pending", "running", "failed"])
async def test_start_refuses_a_job_whose_summary_is_not_completed(
    start_harness: _StartHarness, summary_status: str
) -> None:
    jobs = start_harness.serve(_job(None, summary_status))

    with pytest.raises(fact_check_runner.FactCheckNotAllowedError):
        await fact_check_runner.start_fact_check("j")
    await _let_background_tasks_run()

    assert jobs.job["fact_check"] is None
    assert start_harness.runs == []
