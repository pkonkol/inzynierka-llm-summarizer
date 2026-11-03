from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.schemas.context_expansion import ContextExpansionResult, RelatedSource
from app.schemas.summary import UsageMetadata
from app.services import summarization_runner
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
        "run_deepeval": False,
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
