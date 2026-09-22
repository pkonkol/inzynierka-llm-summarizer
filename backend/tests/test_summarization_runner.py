from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.services import summarization_runner


def _job(origin: str) -> dict:
    now = datetime.now(UTC)
    return {
        "job_id": "j",
        "source_url": "https://example.com/long",
        "model_provider": "gemini",
        "model_name": "gemini-flash-latest",
        "processing_strategy": "direct",
        "summary_spec": {},
        "language": "auto",
        "origin": origin,
        "run_deepeval": False,
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
