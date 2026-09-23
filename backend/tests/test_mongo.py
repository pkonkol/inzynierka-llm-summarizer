from unittest.mock import AsyncMock

import pytest

from app.core import mongo


@pytest.fixture
def runs_collection(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    collection = AsyncMock()
    collection.update_many.return_value.modified_count = 0
    monkeypatch.setattr(mongo, "get_evaluation_runs_collection", lambda: collection)
    return collection


@pytest.fixture
def jobs_collection(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    collection = AsyncMock()
    collection.update_many.return_value.modified_count = 0
    monkeypatch.setattr(mongo, "get_jobs_collection", lambda: collection)
    return collection


async def test_runs_expire_on_the_heartbeat_rather_than_creation_time(
    runs_collection: AsyncMock,
) -> None:
    await mongo.cleanup_stale_evaluation_runs()

    query, _ = runs_collection.update_many.call_args_list[0].args
    assert "heartbeat_at" in query
    # Keying off created_at is what killed long live runs after two hours.
    assert "created_at" not in query


async def test_stale_jobs_are_counted(jobs_collection: AsyncMock) -> None:
    jobs_collection.update_many.return_value.modified_count = 2
    assert await mongo.cleanup_stale_pending_jobs() == 2
