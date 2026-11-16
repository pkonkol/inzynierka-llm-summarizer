from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.routers import summarize
from app.schemas.job_api import SummarizeSourceRequest


def _job_document(job_id: str, status: str) -> dict:
    return {
        "job_id": job_id,
        "source_url": f"https://example.com/{job_id}",
        "status": status,
        "summary_data": None,
        "model_provider": "ollama",
        "model_name": "llama3",
        "processing_strategy": "direct",
        "origin": "admin",
        "updated_at": datetime.now(UTC),
    }


@pytest.fixture
def jobs_collection(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    collection = AsyncMock()
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.__aiter__.return_value = iter(())
    collection.find = MagicMock(return_value=cursor)
    monkeypatch.setattr(summarize, "get_jobs_collection", lambda: collection)
    return collection


async def test_the_flat_job_list_is_unfiltered_without_a_status(jobs_collection: AsyncMock) -> None:
    await summarize.list_all_jobs_flat()

    query, _ = jobs_collection.find.call_args.args
    assert query == {}


async def test_a_status_filter_narrows_the_flat_job_list(jobs_collection: AsyncMock) -> None:
    jobs_collection.find.return_value.__aiter__.return_value = iter([_job_document("a", "running")])

    results = await summarize.list_all_jobs_flat(status=["pending", "running"])

    query, _ = jobs_collection.find.call_args.args
    assert query == {"status": {"$in": ["pending", "running"]}}
    assert [job.job_id for job in results] == ["a"]


async def test_an_in_progress_job_carries_no_summary_text(jobs_collection: AsyncMock) -> None:
    jobs_collection.find.return_value.__aiter__.return_value = iter([_job_document("a", "running")])

    # This is what makes the home page cheap to poll: the filtered payload has no summaries in it.
    [job] = await summarize.list_all_jobs_flat(status=["running"])
    assert job.title == ""
    assert job.summary == ""


@pytest.mark.parametrize(
    ("check_facts", "expected_fact_check"),
    [
        pytest.param(
            True,
            {
                "status": "pending",
                "text": None,
                "sources": [],
                "context_expansion": None,
                "usage": None,
                "duration_ms": None,
                "error": None,
            },
            id="case_13_pending_fact_check",
        ),
        pytest.param(False, None, id="case_14_no_fact_check"),
    ],
)
async def test_case_13_14_check_facts_sets_the_fact_check_on_the_job(
    jobs_collection: AsyncMock, check_facts: bool, expected_fact_check: dict | None
) -> None:
    source = SummarizeSourceRequest.model_validate({"url": "https://example.com/a"})

    await summarize.queue_summarization_job(
        source,
        MagicMock(),
        model_provider="gemini",
        model_name="gemini-3.8-flash",
        language="en",
        processing_strategy="direct",
        run_deepeval=False,
        origin="public",
        context_expansion_mode="none",
        check_facts=check_facts,  # pyrefly: ignore
    )

    inserted = jobs_collection.insert_one.call_args.args[0]
    assert inserted["fact_check"] == expected_fact_check
