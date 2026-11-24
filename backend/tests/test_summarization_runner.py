import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.schemas.context_expansion import ContextExpansionResult, RelatedSource
from app.schemas.summary import LlmSummaryResult, UsageMetadata
from app.services import fact_check_runner, summarization_runner
from app.services.context_expansion import ContextExpansionError


def _job(origin: str) -> dict:
    now = datetime.now(UTC)
    return {
        "job_id": "j",
        "source_url": "https://example.com/long",
        "model_provider": "gemini",
        "model_name": "gemini-3.8-flash",
        "processing_strategy": "direct",
        "summary_spec": {},
        "language": "auto",
        "origin": origin,
        "context_expansion_mode": "none",
        "input_text": "",
        "created_at": now,
    }


@pytest.fixture
def jobs_collection(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    collection = AsyncMock()
    monkeypatch.setattr(summarization_runner, "get_jobs_collection", lambda: collection)
    monkeypatch.setattr(
        summarization_runner,
        "extract_text_from_url",
        AsyncMock(return_value={"text": "x" * (settings.public_max_input_chars + 1)}),
    )
    return collection


async def test_a_public_job_over_the_input_limit_fails_with_a_code_the_page_can_show(
    jobs_collection: AsyncMock,
) -> None:
    jobs_collection.find_one.return_value = _job("public")

    await summarization_runner.run_summarization_job("j")

    failure = jobs_collection.update_one.call_args.args[1]["$set"]
    assert failure["status"] == "failed"
    assert failure["error_code"] == "source_too_long"


async def test_an_admin_job_is_not_held_to_the_public_limit(
    jobs_collection: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    jobs_collection.find_one.return_value = _job("admin")
    monkeypatch.setattr(
        summarization_runner, "generate_summary", AsyncMock(side_effect=RuntimeError("stop here"))
    )

    await summarization_runner.run_summarization_job("j")

    failure = jobs_collection.update_one.call_args.args[1]["$set"]
    assert failure["error"] == "stop here"  # got past the length check, into the model call
    assert failure["error_code"] is None


def _context_expansion_result() -> ContextExpansionResult:
    return ContextExpansionResult(
        mode="staged",
        channels=[],
        candidate_count=1,
        selected=[
            RelatedSource(
                channel="web",
                url="https://related.example/",
                title="Related",
                excerpt="Supporting fact.",
                selection_reason="adds context",
                review=None,
            )
        ],
        usage=UsageMetadata(),
        duration_ms=10,
    )


@pytest.fixture
def staged_job(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    collection = AsyncMock()
    collection.find_one.return_value = {**_job("public"), "context_expansion_mode": "staged"}
    monkeypatch.setattr(summarization_runner, "get_jobs_collection", lambda: collection)
    monkeypatch.setattr(
        summarization_runner,
        "extract_text_from_url",
        AsyncMock(return_value={"text": "A short article about a topic. " * 10}),
    )
    monkeypatch.setattr(summarization_runner, "generate_title", AsyncMock(return_value="Title"))
    monkeypatch.setattr(
        summarization_runner,
        "generate_summary",
        AsyncMock(side_effect=RuntimeError("the model must not be reached")),
    )
    monkeypatch.setattr(summarization_runner, "spawn_metrics_task", lambda coro: coro.close())
    return collection


def _all_set_fields(collection: AsyncMock) -> dict:
    fields: dict = {}
    for call in collection.update_one.call_args_list:
        fields.update(call.args[1]["$set"])
    return fields


async def test_case_22_staged_job_stores_context_and_passes_sources_to_the_model(
    staged_job: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    expansion = _context_expansion_result()
    monkeypatch.setattr(
        summarization_runner, "expand_context", AsyncMock(return_value=expansion), raising=False
    )
    generate = AsyncMock(side_effect=RuntimeError("stop after the model call was prepared"))
    monkeypatch.setattr(summarization_runner, "generate_summary", generate)

    await summarization_runner.run_summarization_job("j")

    assert _all_set_fields(staged_job)["context_expansion"] == expansion.model_dump()
    assert generate.await_args.args[0].related_sources == expansion.selected


async def test_case_23_context_expansion_failure_sets_error_code(
    staged_job: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        summarization_runner,
        "expand_context",
        AsyncMock(side_effect=ContextExpansionError("all channels failed")),
        raising=False,
    )

    await summarization_runner.run_summarization_job("j")

    failure = staged_job.update_one.call_args.args[1]["$set"]
    assert failure["status"] == "failed"
    assert failure["error_code"] == "context_expansion_failed"


ARTICLE_TEXT = "A short article about a topic. " * 10
PENDING_FACT_CHECK = {
    "status": "pending",
    "text": None,
    "sources": [],
    "context_expansion": None,
    "usage": None,
    "duration_ms": None,
    "error": None,
}


def _summary_result() -> LlmSummaryResult:
    return LlmSummaryResult(
        summary="Summary.",
        source_url="https://example.com/long",
        usage=UsageMetadata(),
        raw_metadata={},
        raw_output="{}",
        input_text=ARTICLE_TEXT,
        prompt_template=[],
        prompt_params={},
    )


@pytest.fixture
def fact_check_starts(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Names of every fact-check entry point the summarization reached."""
    started: list[str] = []

    async def run_fact_check(*_args: object) -> None:
        started.append("run_fact_check")

    monkeypatch.setattr(fact_check_runner, "run_fact_check", run_fact_check)
    monkeypatch.setattr(
        summarization_runner,
        "spawn_fact_check",
        lambda *_args: started.append("spawn_fact_check"),
        raising=False,
    )
    return started


def _job_runner(
    monkeypatch: pytest.MonkeyPatch, fact_check: dict | None, summary: AsyncMock
) -> AsyncMock:
    collection = AsyncMock()
    collection.find_one.return_value = {**_job("public"), "fact_check": fact_check}
    monkeypatch.setattr(summarization_runner, "get_jobs_collection", lambda: collection)
    monkeypatch.setattr(
        summarization_runner,
        "extract_text_from_url",
        AsyncMock(return_value={"text": ARTICLE_TEXT}),
    )
    monkeypatch.setattr(summarization_runner, "generate_title", AsyncMock(return_value="Title"))
    monkeypatch.setattr(summarization_runner, "generate_summary", summary)
    monkeypatch.setattr(summarization_runner, "spawn_metrics_task", lambda coro: coro.close())
    return collection


@pytest.mark.parametrize(
    "fact_check",
    [
        pytest.param(None, id="new_job"),
        pytest.param(PENDING_FACT_CHECK, id="job_with_pending_check"),
    ],
)
async def test_a_completed_summary_does_not_start_a_fact_check(
    monkeypatch: pytest.MonkeyPatch, fact_check_starts: list[str], fact_check: dict | None
) -> None:
    collection = _job_runner(monkeypatch, fact_check, AsyncMock(return_value=_summary_result()))

    await summarization_runner.run_summarization_job("j")
    await asyncio.sleep(0)

    assert _all_set_fields(collection)["status"] == "completed"
    assert fact_check_starts == []


@pytest.mark.parametrize(
    "fact_check",
    [
        pytest.param(None, id="new_job"),
        pytest.param(PENDING_FACT_CHECK, id="job_with_pending_check"),
    ],
)
async def test_a_failed_summary_leaves_the_fact_check_field_alone(
    monkeypatch: pytest.MonkeyPatch, fact_check_starts: list[str], fact_check: dict | None
) -> None:
    collection = _job_runner(monkeypatch, fact_check, AsyncMock(side_effect=RuntimeError("down")))

    await summarization_runner.run_summarization_job("j")
    await asyncio.sleep(0)

    written = _all_set_fields(collection)
    assert written["status"] == "failed"
    assert not [key for key in written if key.startswith("fact_check")]
    assert fact_check_starts == []


async def _let_background_tasks_run() -> None:
    for _ in range(5):
        await asyncio.sleep(0)


@pytest.fixture
def fact_check_runs(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Job ids passed to run_fact_check, whichever module the runner calls it through."""
    runs: list[str] = []

    async def run_fact_check(job_id: str) -> None:
        runs.append(job_id)

    monkeypatch.setattr(fact_check_runner, "run_fact_check", run_fact_check)
    monkeypatch.setattr(summarization_runner, "run_fact_check", run_fact_check, raising=False)
    return runs


def _completion_update(collection: AsyncMock) -> dict:
    completions = [
        call.args[1]["$set"]
        for call in collection.update_one.call_args_list
        if call.args[1]["$set"].get("status") == "completed"
    ]
    assert len(completions) == 1
    return completions[0]


async def test_a_summary_flagged_for_fact_checking_completes_with_a_pending_fact_check(
    monkeypatch: pytest.MonkeyPatch, fact_check_runs: list[str]
) -> None:
    collection = _job_runner(monkeypatch, None, AsyncMock(return_value=_summary_result()))
    collection.find_one.return_value = {
        **collection.find_one.return_value,
        "check_facts_on_completion": True,
    }

    await summarization_runner.run_summarization_job("j")

    completion = _completion_update(collection)
    assert completion["fact_check"]["status"] == "pending"
    assert completion["fact_check"]["sources"] == []
    assert completion["fact_check"]["text"] is None


async def test_a_summary_flagged_for_fact_checking_starts_the_fact_check_in_the_background(
    monkeypatch: pytest.MonkeyPatch, fact_check_runs: list[str]
) -> None:
    collection = _job_runner(monkeypatch, None, AsyncMock(return_value=_summary_result()))
    collection.find_one.return_value = {
        **collection.find_one.return_value,
        "check_facts_on_completion": True,
    }

    await summarization_runner.run_summarization_job("j")
    await _let_background_tasks_run()

    assert fact_check_runs == ["j"]


@pytest.mark.parametrize(
    "flag", [pytest.param(False, id="flag_off"), pytest.param(None, id="flag_missing")]
)
async def test_a_summary_without_the_flag_completes_without_a_fact_check(
    monkeypatch: pytest.MonkeyPatch, fact_check_runs: list[str], flag: bool | None
) -> None:
    collection = _job_runner(monkeypatch, None, AsyncMock(return_value=_summary_result()))
    if flag is not None:
        collection.find_one.return_value = {
            **collection.find_one.return_value,
            "check_facts_on_completion": flag,
        }

    await summarization_runner.run_summarization_job("j")
    await _let_background_tasks_run()

    assert (
        "fact_check" not in _completion_update(collection)
        or _completion_update(collection)["fact_check"] is None
    )
    assert fact_check_runs == []


async def test_a_failed_summary_flagged_for_fact_checking_starts_no_fact_check(
    monkeypatch: pytest.MonkeyPatch, fact_check_runs: list[str]
) -> None:
    collection = _job_runner(monkeypatch, None, AsyncMock(side_effect=RuntimeError("down")))
    collection.find_one.return_value = {
        **collection.find_one.return_value,
        "check_facts_on_completion": True,
    }

    await summarization_runner.run_summarization_job("j")
    await _let_background_tasks_run()

    written = _all_set_fields(collection)
    assert written["status"] == "failed"
    assert not [key for key in written if key.startswith("fact_check")]
    assert fact_check_runs == []


def test_pending_fact_check_helper_builds_an_empty_pending_check() -> None:
    requested_at = datetime.now(UTC)

    pending = fact_check_runner.pending_fact_check(requested_at)

    assert pending.status == "pending"
    assert pending.requested_at == requested_at
    assert pending.text is None
    assert pending.sources == []
    assert pending.usage is None
    assert pending.error is None
