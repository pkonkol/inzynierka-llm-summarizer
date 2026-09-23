from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

from app.core.config import settings
from app.services import startup_resume


def _empty_cursor() -> MagicMock:
    cursor = MagicMock()
    cursor.__aiter__.return_value = iter(())
    return cursor


@pytest.fixture
def runs_collection(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    collection = AsyncMock()
    collection.find = MagicMock(return_value=_empty_cursor())
    monkeypatch.setattr(startup_resume, "get_evaluation_runs_collection", lambda: collection)
    return collection


@pytest.fixture
def jobs_collection(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    collection = AsyncMock()
    collection.find = MagicMock(return_value=_empty_cursor())
    monkeypatch.setattr(startup_resume, "get_jobs_collection", lambda: collection)
    return collection


@pytest.fixture
def sets_collection(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    collection = AsyncMock()
    collection.find = MagicMock(return_value=_empty_cursor())
    monkeypatch.setattr(startup_resume, "get_evaluation_sets_collection", lambda: collection)
    return collection


async def test_claim_succeeds_only_when_the_conditional_update_matched(
    runs_collection: AsyncMock,
) -> None:
    runs_collection.update_one.return_value.modified_count = 1
    assert await startup_resume.claim_evaluation_run_for_resume(ObjectId()) is True

    runs_collection.update_one.return_value.modified_count = 0
    assert await startup_resume.claim_evaluation_run_for_resume(ObjectId()) is False


async def test_claim_requires_a_stale_heartbeat_and_spends_an_attempt(
    runs_collection: AsyncMock,
) -> None:
    runs_collection.update_one.return_value.modified_count = 1
    await startup_resume.claim_evaluation_run_for_resume(ObjectId())

    query, update = runs_collection.update_one.call_args.args
    assert "heartbeat_at" in query
    assert query["resume_attempts"] == {"$lt": settings.max_resume_attempts}
    assert update["$inc"] == {"resume_attempts": 1}


async def test_a_manual_resume_lifts_the_cap_but_keeps_the_heartbeat_check(
    runs_collection: AsyncMock,
) -> None:
    runs_collection.update_one.return_value.modified_count = 1
    await startup_resume.claim_evaluation_run_for_resume(ObjectId(), reset_attempts=True)

    query, update = runs_collection.update_one.call_args.args
    # Skipping this is how two loops end up writing the same entries.
    assert "heartbeat_at" in query
    assert "resume_attempts" not in query
    assert update["$set"]["resume_attempts"] == 0
    assert "$inc" not in update


async def test_startup_does_not_wait_out_a_staleness_window(
    runs_collection: AsyncMock, jobs_collection: AsyncMock, sets_collection: AsyncMock
) -> None:
    await startup_resume.resume_interrupted_work()

    run_query = runs_collection.find.call_args.args[0]
    # A run killed a minute before the restart has a fresh heartbeat; requiring staleness here
    # would leave it unresumed until some later boot.
    assert "heartbeat_at" not in run_query
    assert run_query["resume_attempts"] == {"$lt": settings.max_resume_attempts}


async def test_golden_metrics_passes_are_resumed_by_attempt_budget_not_heartbeat(
    runs_collection: AsyncMock, jobs_collection: AsyncMock, sets_collection: AsyncMock
) -> None:
    await startup_resume.resume_interrupted_work()

    set_query = sets_collection.find.call_args.args[0]
    assert set_query["golden_metrics_pass.status"] == {"$in": ["pending", "running"]}
    assert set_query["golden_metrics_pass.resume_attempts"] == {"$lt": settings.max_resume_attempts}


async def test_golden_metrics_queue_claim_succeeds_only_when_the_update_matched(
    sets_collection: AsyncMock,
) -> None:
    sets_collection.update_one.return_value.modified_count = 1
    assert await startup_resume.claim_golden_metrics_pass_for_queue(ObjectId()) is True

    sets_collection.update_one.return_value.modified_count = 0
    assert await startup_resume.claim_golden_metrics_pass_for_queue(ObjectId()) is False


async def test_golden_metrics_queue_claim_allows_missing_failed_or_stale(
    sets_collection: AsyncMock,
) -> None:
    sets_collection.update_one.return_value.modified_count = 1
    await startup_resume.claim_golden_metrics_pass_for_queue(ObjectId())

    query, update = sets_collection.update_one.call_args.args
    conditions = query["$or"]
    assert {"golden_metrics_pass": None} in conditions
    assert {"golden_metrics_pass.status": "failed"} in conditions
    assert any(
        cond.get("golden_metrics_pass.status") == {"$in": ["pending", "running"]}
        and "golden_metrics_pass.heartbeat_at" in cond
        for cond in conditions
    )
    assert update["$set"]["golden_metrics_pass.status"] == "pending"
    assert update["$set"]["golden_metrics_pass.resume_attempts"] == 0
    assert update["$set"]["golden_metrics_pass.error"] is None
