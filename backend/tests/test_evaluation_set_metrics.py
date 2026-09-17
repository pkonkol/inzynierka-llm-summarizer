from unittest.mock import AsyncMock

import pytest

from app.services import evaluation_set_metrics

_SET_ID = "507f1f77bcf86cd799439011"


def _set_document(entries: list[dict]) -> dict:
    return {"_id": _SET_ID, "entries": entries}


@pytest.fixture
def sets_collection(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    collection = AsyncMock()
    monkeypatch.setattr(
        evaluation_set_metrics, "get_evaluation_sets_collection", lambda: collection
    )
    return collection


@pytest.fixture
def find_entry(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock()
    monkeypatch.setattr(evaluation_set_metrics, "find_evaluation_set_entry", mock)
    return mock


@pytest.fixture
def build_metrics(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock(return_value={"source": {}, "summary": {}, "deepeval": []})
    monkeypatch.setattr(evaluation_set_metrics, "build_golden_metrics", mock)
    return mock


def _status_updates(sets_collection: AsyncMock) -> list[dict]:
    return [
        call.args[1]["$set"]
        for call in sets_collection.update_one.call_args_list
        if "golden_metrics_pass.status" in call.args[1]["$set"]
    ]


async def test_an_entry_with_existing_golden_metrics_is_skipped(
    sets_collection: AsyncMock, find_entry: AsyncMock, build_metrics: AsyncMock
) -> None:
    sets_collection.find_one.return_value = _set_document(
        [{"entry_id": "e1", "golden_metrics": {"already": "there"}}]
    )

    await evaluation_set_metrics.run_golden_metrics_pass(_SET_ID)

    find_entry.assert_not_called()
    build_metrics.assert_not_called()
    assert [u["golden_metrics_pass.status"] for u in _status_updates(sets_collection)] == [
        "running",
        "completed",
    ]


async def test_a_judge_failure_leaves_the_pass_marked_failed_with_a_message(
    sets_collection: AsyncMock, find_entry: AsyncMock, build_metrics: AsyncMock
) -> None:
    sets_collection.find_one.return_value = _set_document(
        [{"entry_id": "e1", "golden_metrics": None}]
    )
    find_entry.return_value = {"input_text": "text", "golden_summary": "summary"}
    build_metrics.side_effect = RuntimeError("judge unavailable")

    with pytest.raises(RuntimeError):
        await evaluation_set_metrics.run_golden_metrics_pass(_SET_ID)

    failed_updates = [u for u in _status_updates(sets_collection) if "failed" in u.values()]
    assert len(failed_updates) == 1
    assert failed_updates[0]["golden_metrics_pass.error"] == "judge unavailable"


async def test_a_clean_pass_writes_each_entry_and_finishes_completed(
    sets_collection: AsyncMock, find_entry: AsyncMock, build_metrics: AsyncMock
) -> None:
    sets_collection.find_one.return_value = _set_document(
        [
            {"entry_id": "e1", "golden_metrics": None},
            {"entry_id": "e2", "golden_metrics": None},
        ]
    )
    find_entry.side_effect = [
        {"input_text": "t1", "golden_summary": "g1"},
        {"input_text": "t2", "golden_summary": "g2"},
    ]

    await evaluation_set_metrics.run_golden_metrics_pass(_SET_ID)

    entry_updates = [
        call.args[1]["$set"]
        for call in sets_collection.update_one.call_args_list
        if "entries.$.golden_metrics" in call.args[1]["$set"]
    ]
    assert len(entry_updates) == 2
    assert build_metrics.call_count == 2
    assert [u["golden_metrics_pass.status"] for u in _status_updates(sets_collection)] == [
        "running",
        "completed",
    ]
