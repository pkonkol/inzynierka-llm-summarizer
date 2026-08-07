from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from bson import ObjectId

from app.core.mongo import get_evaluation_runs_collection, get_evaluation_sets_collection
from app.services.llm import generate_summary
from ..services.run_metrics import compute_cross_metrics, compute_deterministic_metrics, join_takeaways

logger = logging.getLogger(__name__)


async def run_evaluation_batch(run_id: str) -> None:
    runs = get_evaluation_runs_collection()
    sets = get_evaluation_sets_collection()

    run_doc = await runs.find_one({"_id": ObjectId(run_id)})
    if run_doc is None:
        return

    set_doc = await sets.find_one({"_id": ObjectId(run_doc["evaluation_set_id"])})
    if set_doc is None:
        await runs.update_one(
            {"_id": ObjectId(run_id)},
            {
                "$set": {
                    "status": "failed",
                    "finished_at": datetime.now(UTC),
                    "aggregate_metrics": {"error": "Evaluation set not found"},
                }
            },
        )
        return

    await runs.update_one({"_id": ObjectId(run_id)}, {"$set": {"status": "running"}})

    source_entries_by_id = {entry["entry_id"]: entry for entry in set_doc["entries"]}
    delay_ms = run_doc["rate_limit_delay_ms"]

    statuses: list[str] = []

    for run_entry in run_doc["entries"]:
        entry_id = run_entry["entry_id"]
        source_entry = source_entries_by_id[entry_id]
        update: dict = {}

        try:
            summary = await generate_summary(
                input={"text": source_entry["input_text"], "title": source_entry["source_meta"]["title"]},
                source_url=source_entry["source_meta"]["url"],
                model_name=run_doc["model_name"],
                model_provider=run_doc["model_provider"],
                language=run_doc["language"],
                mode=run_doc["summary_mode"],
            )

            summary_text = summary["summary"]
            takeaways = summary["key_takeaways"]

            update["ai_summary"] = summary_text
            update["ai_key_takeaways"] = takeaways
            update["ai_metrics"] = await compute_deterministic_metrics(
                summary_text=summary_text,
                takeaways_text=join_takeaways(takeaways),
                source_text=source_entry["input_text"],
            )
            update["cross_metrics"] = await compute_cross_metrics(
                reference_text=run_entry["golden_summary"],
                summary_text=summary_text,
            )
            update["status"] = "completed"
            update["error"] = None
        except Exception as exc:
            update["status"] = "failed"
            update["error"] = str(exc)
            logger.error("Failed entry %s for run %s: %s", entry_id, run_id, exc)

        statuses.append(update["status"])

        await runs.update_one(
            {"_id": ObjectId(run_id), "entries.entry_id": entry_id},
            {"$set": {f"entries.$.{key}": value for key, value in update.items()}},
        )

        if delay_ms > 0:
            await asyncio.sleep(delay_ms / 1000)

    completed = sum(1 for status in statuses if status == "completed")
    failed = sum(1 for status in statuses if status == "failed")

    await runs.update_one(
        {"_id": ObjectId(run_id)},
        {
            "$set": {
                "status": "completed" if failed == 0 else "failed",
                "finished_at": datetime.now(UTC),
                "aggregate_metrics": {
                    "entry_count": len(statuses),
                    "completed_entries": completed,
                    "failed_entries": failed,
                },
            }
        },
    )