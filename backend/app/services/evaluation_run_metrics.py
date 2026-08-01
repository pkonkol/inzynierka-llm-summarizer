from __future__ import annotations

import logging
from datetime import UTC, datetime

from bson import ObjectId

from app.core.mongo import get_evaluation_runs_collection, get_evaluation_sets_collection
from app.services.run_metrics import compute_deepeval_metrics, join_takeaways

logger = logging.getLogger(__name__)


async def compute_run_deepeval_metrics(run_id: str) -> None:
    runs = get_evaluation_runs_collection()
    sets = get_evaluation_sets_collection()

    run_doc = await runs.find_one({"_id": ObjectId(run_id)})
    if run_doc is None:
        return

    aggregate_metrics = run_doc.get("aggregate_metrics", {})
    deepeval_summary = {
        "status": "running",
        "started_at": datetime.now(UTC),
    }
    aggregate_metrics["deepeval"] = deepeval_summary
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

    source_by_entry_id = {
        entry["entry_id"]: entry["input_text"]
        for entry in set_doc["entries"]
    }

    entries = run_doc["entries"]
    updated_entries = 0
    skipped_entries = 0

    try:
        for entry in entries:
            if entry.get("status") != "completed":
                skipped_entries += 1
                continue

            summary_text = (entry.get("ai_summary") or "").strip()
            takeaways = [item for item in entry.get("ai_key_takeaways", []) if item]
            takeaways_text = join_takeaways(takeaways)
            source_text = source_by_entry_id.get(entry["entry_id"], "")

            if not summary_text and not takeaways_text:
                skipped_entries += 1
                continue

            deepeval_metrics = await compute_deepeval_metrics(
                summary_text=summary_text,
                takeaways_text=takeaways_text,
                source_text=source_text,
            )

            ai_metrics = entry.get("ai_metrics") or {}
            ai_metrics["deepeval"] = deepeval_metrics
            entry["ai_metrics"] = ai_metrics
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
            {"$set": {"entries": entries, "aggregate_metrics": aggregate_metrics}},
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
        {"$set": {"entries": entries, "aggregate_metrics": aggregate_metrics}},
    )
