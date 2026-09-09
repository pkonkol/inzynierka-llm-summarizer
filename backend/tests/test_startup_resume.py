from unittest.mock import AsyncMock

import pytest
from bson import ObjectId

from app.core.config import settings
from app.services import startup_resume


@pytest.fixture
def runs_collection(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    collection = AsyncMock()
    monkeypatch.setattr(startup_resume, "get_evaluation_runs_collection", lambda: collection)
    return collection


@pytest.fixture
def jobs_collection(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    collection = AsyncMock()
    monkeypatch.setattr(startup_resume, "get_jobs_collection", lambda: collection)
    return collection


async def test_claim_succeeds_only_when_the_conditional_update_matched(
    runs_collection: AsyncMock,
) -> None:
    runs_collection.update_one.return_value.modified_count = 1
    assert await startup_resume.claim_evaluation_run_for_resume(ObjectId()) is True

    runs_collection.update_one.return_value.modified_count = 0
    assert await startup_resume.claim_evaluation_run_for_resume(ObjectId()) is False


async def test_claim_filters_on_staleness_and_the_attempt_cap(runs_collection: AsyncMock) -> None:
    runs_collection.update_one.return_value.modified_count = 1
    await startup_resume.claim_evaluation_run_for_resume(ObjectId())

    query, update = runs_collection.update_one.call_args.args
    assert "heartbeat_at" in query
    assert query["resume_attempts"] == {"$lt": settings.max_resume_attempts}
    assert update["$inc"] == {"resume_attempts": 1}


async def test_a_manual_resume_lifts_the_cap_but_keeps_the_staleness_check(
    runs_collection: AsyncMock,
) -> None:
    runs_collection.update_one.return_value.modified_count = 1
    await startup_resume.claim_evaluation_run_for_resume(ObjectId(), reset_attempts=True)

    query, update = runs_collection.update_one.call_args.args
    assert "heartbeat_at" in query
    assert "resume_attempts" not in query
    assert update["$set"]["resume_attempts"] == 0
    assert "$inc" not in update


async def test_a_job_missing_the_stored_language_is_never_resumed(
    jobs_collection: AsyncMock,
) -> None:
    jobs_collection.update_one.return_value.modified_count = 1
    await startup_resume.claim_summarization_job_for_resume("job-1")

    query, _ = jobs_collection.update_one.call_args.args
    assert query["status"] == "pending"
    assert query["resume_attempts"] == {"$lt": settings.max_resume_attempts}
