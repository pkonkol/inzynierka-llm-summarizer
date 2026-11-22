"""The public web-search budget (E8b2): one daily allowance for web context and fact checks."""

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import HTTPException

from app.core import rate_limit
from app.core.config import settings

DAILY_LIMIT = 2


class _JobsInMemory:
    """Answers the two queries the limit asks: count_documents and find_one, over plain dicts."""

    def __init__(self, jobs: list[dict[str, Any]]) -> None:
        self.jobs = jobs

    async def count_documents(self, query: dict[str, Any]) -> int:
        return len([job for job in self.jobs if _matches(job, query)])

    async def find_one(
        self, query: dict[str, Any], sort: list[tuple[str, int]] | None = None
    ) -> dict[str, Any] | None:
        found = [job for job in self.jobs if _matches(job, query)]
        if sort:
            path = sort[0][0]
            found.sort(key=lambda job: _value_at(job, path))  # pyrefly: ignore
        return found[0] if found else None


def _value_at(job: dict[str, Any], path: str) -> object:
    value: Any = job
    for part in path.split("."):
        value = value.get(part) if isinstance(value, dict) else None
    return value


def _matches(job: dict[str, Any], query: dict[str, Any]) -> bool:
    for key, condition in query.items():
        if key == "$or":
            if not any(_matches(job, option) for option in condition):
                return False
            continue
        value = _value_at(job, key)
        if isinstance(condition, dict):
            if "$gte" in condition and not (value is not None and value >= condition["$gte"]):
                return False
            if "$ne" in condition and value == condition["$ne"]:
                return False
        elif value != condition:
            return False
    return True


def _public_job(
    *, created_ago: timedelta, mode: str = "none", fact_check_requested_ago: timedelta | None = None
) -> dict[str, Any]:
    now = datetime.now(UTC)
    fact_check = (
        None
        if fact_check_requested_ago is None
        else {"status": "completed", "requested_at": now - fact_check_requested_ago}
    )
    return {
        "origin": "public",
        "context_expansion_mode": mode,
        "created_at": now - created_ago,
        "fact_check": fact_check,
    }


@pytest.fixture
def jobs(monkeypatch: pytest.MonkeyPatch) -> _JobsInMemory:
    store = _JobsInMemory([])
    monkeypatch.setattr(rate_limit, "get_jobs_collection", lambda: store)
    monkeypatch.setattr(settings, "public_context_expansion_daily_limit", DAILY_LIMIT)
    return store


async def test_daily_limit_counts_fact_checks_by_request_time(jobs: _JobsInMemory) -> None:
    jobs.jobs = [
        _public_job(created_ago=timedelta(hours=2), mode="staged"),
        _public_job(
            created_ago=timedelta(days=3),
            fact_check_requested_ago=timedelta(minutes=5),
        ),
    ]

    with pytest.raises(HTTPException) as refused:
        await rate_limit.enforce_public_web_search_limit()

    assert refused.value.status_code == 429


async def test_a_fact_check_requested_outside_the_window_is_not_counted(
    jobs: _JobsInMemory,
) -> None:
    jobs.jobs = [
        _public_job(created_ago=timedelta(hours=2), mode="staged"),
        _public_job(
            created_ago=timedelta(hours=1),
            fact_check_requested_ago=timedelta(hours=30),
        ),
    ]

    await rate_limit.enforce_public_web_search_limit()


async def test_a_staged_job_created_outside_the_window_is_not_counted(jobs: _JobsInMemory) -> None:
    jobs.jobs = [
        _public_job(created_ago=timedelta(hours=2), mode="staged"),
        _public_job(created_ago=timedelta(days=2), mode="staged"),
    ]

    await rate_limit.enforce_public_web_search_limit()


async def test_a_job_without_web_search_or_fact_check_is_not_counted(jobs: _JobsInMemory) -> None:
    jobs.jobs = [
        _public_job(created_ago=timedelta(hours=1)),
        _public_job(created_ago=timedelta(hours=1)),
        _public_job(created_ago=timedelta(hours=1), mode="staged"),
    ]

    await rate_limit.enforce_public_web_search_limit()


async def test_the_refusal_tells_when_the_oldest_search_leaves_the_window(
    jobs: _JobsInMemory,
) -> None:
    jobs.jobs = [
        _public_job(created_ago=timedelta(hours=23), mode="staged"),
        _public_job(
            created_ago=timedelta(days=3),
            fact_check_requested_ago=timedelta(hours=20),
        ),
    ]

    with pytest.raises(HTTPException) as refused:
        await rate_limit.enforce_public_web_search_limit()

    assert refused.value.status_code == 429
    assert refused.value.headers is not None
    assert 3590 <= int(refused.value.headers["Retry-After"]) <= 3601
