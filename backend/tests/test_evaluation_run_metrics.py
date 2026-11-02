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

    await evaluation_run_metrics.reset_run_judgements(_RUN_ID)

    query, update = runs_collection.update_one.call_args.args
    assert query == {"_id": ObjectId(_RUN_ID)}
    assert update["$set"] == {
        "entries.$[completed].ai_metrics.deepeval": None,
        "entries.$[completed].cross_metrics.deepeval": [],
    }
    assert runs_collection.update_one.call_args.kwargs["array_filters"] == [
        {"completed.status": "completed"}
    ]
