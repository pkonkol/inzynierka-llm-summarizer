from __future__ import annotations

import logging
from datetime import UTC, datetime

from bson import ObjectId

from app.core.mongo import get_evaluation_runs_collection, get_evaluation_sets_collection
from app.services.run_metrics import (
    compute_cross_metrics,
    compute_deepeval_metrics,
    compute_pairwise_cross_deepeval_metrics,
    join_takeaways,
)

logger = logging.getLogger(__name__)


async def compute_run_deepeval_metrics(run_id: str) -> None:
    runs = get_evaluation_runs_collection()
    sets = get_evaluation_sets_collection()

    run_doc = await runs.find_one({"_id": ObjectId(run_id)})
    if run_doc is None:
        return

    aggregate_metrics = run_doc["aggregate_metrics"]
    aggregate_metrics["deepeval"] = {
        "status": "running",
        "started_at": datetime.now(UTC),
    }
    await runs.update_one(
        {"_id": ObjectId(run_id)},
        {"$set": {"aggregate_metrics": aggregate_metrics}},
    )

    set_doc = await sets.find_one({"_id": ObjectId(run_doc["evaluation_set_id"])})
    if set_doc is None:
        aggregate_metrics["deepeval"] = {
            "status": "failed",
            "error": "Evaluation set not found",
            "finished_at": datetime.now(UTC),
        }
        await runs.update_one(
            {"_id": ObjectId(run_id)},
            {"$set": {"aggregate_metrics": aggregate_metrics}},
        )
        return

    source_by_entry_id = {entry["entry_id"]: entry["input_text"] for entry in set_doc["entries"]}
    updated_entries = 0
    skipped_entries = 0

    try:
        for entry in run_doc["entries"]:
            if entry["status"] != "completed":
                skipped_entries += 1
                continue

            entry_id = entry["entry_id"]
            summary_text = entry["ai_summary"].strip()
            takeaways_text = join_takeaways(entry["ai_key_takeaways"])
            source_text = source_by_entry_id[entry_id]

            deepeval_metrics = await compute_deepeval_metrics(
                summary_text=summary_text,
                takeaways_text=takeaways_text,
                source_text=source_text,
            )

            ai_metrics = entry["ai_metrics"]
            ai_metrics["deepeval"] = deepeval_metrics

            cross_metrics = await compute_cross_metrics(
                reference_text=entry["golden_summary"],
                summary_text=summary_text,
            )
            pairwise = await compute_pairwise_cross_deepeval_metrics(
                source_text=source_text,
                golden_summary=entry["golden_summary"],
                ai_summary=summary_text,
            )
            cross_metrics["deepeval"] = pairwise

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
        logger.exception("DEEPEVAL failed for run %s", run_id)
        aggregate_metrics["deepeval"] = {
            "status": "failed",
            "error": str(exc),
            "finished_at": datetime.now(UTC),
        }
        await runs.update_one(
            {"_id": ObjectId(run_id)},
            {"$set": {"aggregate_metrics": aggregate_metrics}},
        )
        raise

    aggregate_metrics["deepeval"] = {
        "status": "completed",
        "updated_entries": updated_entries,
        "skipped_entries": skipped_entries,
        "finished_at": datetime.now(UTC),
    }
    await runs.update_one(
        {"_id": ObjectId(run_id)},
        {"$set": {"aggregate_metrics": aggregate_metrics}},
    )
