from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

import structlog
from bson import ObjectId

from ..core.background_work import track_background_work
from ..core.mongo import get_evaluation_runs_collection, get_evaluation_sets_collection
from .evaluation_runner import fetch_source_entry
from .run_metrics import (
    compute_cross_metrics,
    compute_deepeval_metrics,
    compute_pairwise_cross_deepeval_metrics,
    join_takeaways,
)

log = structlog.get_logger(__name__)


async def _store_deepeval_status(run_id: str, deepeval_status: dict[str, Any]) -> None:
    await get_evaluation_runs_collection().update_one(
        {"_id": ObjectId(run_id)},
        {"$set": {"aggregate_metrics.deepeval": deepeval_status}},
    )


async def mark_deepeval_pass_started(run_id: str) -> None:
    await _store_deepeval_status(run_id, {"status": "running", "started_at": datetime.now(UTC)})


@track_background_work("deepeval_pass")
async def compute_run_deepeval_metrics(run_id: str) -> None:
    runs = get_evaluation_runs_collection()
    sets = get_evaluation_sets_collection()

    run_doc = await runs.find_one(
        {"_id": ObjectId(run_id)},
        {
            "evaluation_set_id": 1,
            "entries.entry_id": 1,
            "entries.status": 1,
            "entries.golden_summary": 1,
            "entries.ai_summary": 1,
            "entries.ai_key_takeaways": 1,
            "entries.ai_metrics": 1,
        },
    )
    if run_doc is None:
        return

    set_id = run_doc["evaluation_set_id"]
    set_doc = await sets.find_one({"_id": ObjectId(set_id)}, {"_id": 1})
    if set_doc is None:
        await _store_deepeval_status(
            run_id,
            {
                "status": "failed",
                "error": "Evaluation set not found",
                "finished_at": datetime.now(UTC),
            },
        )
        return

    updated_entries = 0
    skipped_entries = 0
    already_scored_entries = 0

    try:
        for entry in run_doc["entries"]:
            if entry["status"] != "completed":
                skipped_entries += 1
                continue

            if entry["ai_metrics"].get("deepeval") is not None:
                already_scored_entries += 1
                continue

            entry_id = entry["entry_id"]
            summary_text = entry["ai_summary"].strip()
            takeaways_text = join_takeaways(entry["ai_key_takeaways"])
            source_text = (await fetch_source_entry(set_id, entry_id))["input_text"]

            deepeval_metrics, rouge_meteor, pairwise = await asyncio.gather(
                compute_deepeval_metrics(
                    summary_text=summary_text,
                    takeaways_text=takeaways_text,
                    source_text=source_text,
                ),
                compute_cross_metrics(
                    reference_text=entry["golden_summary"],
                    summary_text=summary_text,
                ),
                compute_pairwise_cross_deepeval_metrics(
                    source_text=source_text,
                    golden_summary=entry["golden_summary"],
                    ai_summary=summary_text,
                ),
            )

            ai_metrics = entry["ai_metrics"]
            ai_metrics["deepeval"] = deepeval_metrics
            cross_metrics: dict[str, Any] = {**rouge_meteor, "deepeval": pairwise}

            await runs.update_one(
                {"_id": ObjectId(run_id), "entries.entry_id": entry_id},
                {
                    "$set": {
                        "entries.$.ai_metrics": ai_metrics,
                        "entries.$.cross_metrics": cross_metrics,
                    }
                },
            )
            updated_entries += 1
    except Exception as exc:
        log.exception("deepeval failed", run_id=run_id)
        await _store_deepeval_status(
            run_id,
            {"status": "failed", "error": str(exc), "finished_at": datetime.now(UTC)},
        )
        raise

    await _store_deepeval_status(
        run_id,
        {
            "status": "completed",
            "updated_entries": updated_entries,
            "skipped_entries": skipped_entries,
            "already_scored_entries": already_scored_entries,
            "finished_at": datetime.now(UTC),
        },
    )
