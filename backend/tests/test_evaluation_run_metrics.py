from unittest.mock import AsyncMock

import pytest
from bson import ObjectId

from app.services import evaluation_run_metrics

_RUN_ID = "507f1f77bcf86cd799439011"


async def test_reset_run_judgements_targets_completed_entries_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runs_collection = AsyncMock()
    monkeypatch.setattr(
        evaluation_run_metrics, "get_evaluation_runs_collection", lambda: runs_collection
    )

    await evaluation_run_metrics.reset_run_judgements(_RUN_ID, "openrouter:judge")

    query, update = runs_collection.update_one.call_args.args
    assert query == {"_id": ObjectId(_RUN_ID)}
    assert update["$pull"] == {
        "entries.$[completed].ai_metrics.judges": {"judge_model": "openrouter:judge"},
        "entries.$[paired].cross_metrics.pairwise": {"judge_model": "openrouter:judge"},
    }
    assert runs_collection.update_one.call_args.kwargs["array_filters"] == [
        {"completed.status": "completed"},
        {"paired.status": "completed", "paired.cross_metrics": {"$ne": None}},
    ]


async def test_a_failed_reset_marks_the_forced_pass_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    runs_collection = AsyncMock()
    runs_collection.update_one.side_effect = [RuntimeError("mongo down"), None]
    monkeypatch.setattr(
        evaluation_run_metrics, "get_evaluation_runs_collection", lambda: runs_collection
    )
    judge_entries = AsyncMock()
    monkeypatch.setattr(evaluation_run_metrics, "_judge_run_entries", judge_entries)

    with pytest.raises(RuntimeError):
        await evaluation_run_metrics.run_judge_pass(_RUN_ID, "openrouter:judge", force=True)

    status_update = runs_collection.update_one.call_args_list[1].args[1]["$set"]
    assert status_update["aggregate_metrics.judges.status"] == "failed"
    judge_entries.assert_not_awaited()
