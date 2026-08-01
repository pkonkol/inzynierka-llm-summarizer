from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from bson import ObjectId

from app.core.mongo import get_evaluation_runs_collection, get_evaluation_sets_collection
from app.services.llm import generate_summary
from ..services.run_metrics import compute_deterministic_metrics, join_takeaways

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

    entries = set_doc["entries"]
    delay_ms = run_doc["rate_limit_delay_ms"]

    for entry in entries:
        try:
            summary = await generate_summary(
                input={"text": entry["input_text"], "title": entry["source_meta"]["title"]},
                source_url=entry["source_meta"]["url"],
                model_name=run_doc["model_name"],
                model_provider=run_doc["model_provider"],
                language=run_doc["language"],
                mode=run_doc["summary_mode"],
            )

            summary_text = summary["summary"]
            takeaways = summary["key_takeaways"]

            entry["ai_summary"] = summary_text
            entry["ai_key_takeaways"] = takeaways
            entry["ai_metrics"] = await compute_deterministic_metrics(
                summary_text=summary_text,
                takeaways_text=join_takeaways(takeaways),
                source_text=entry["input_text"],
            )
            entry["cross_metrics"] = None
            entry["status"] = "completed"
            entry["error"] = None
        except Exception as exc:
            entry["status"] = "failed"
            entry["error"] = str(exc)
            logger.error("Failed entry %s for run %s: %s", entry["entry_id"], run_id, exc)

        await runs.update_one(
            {"_id": ObjectId(run_id)},
            {"$set": {"entries": entries}},
        )

        if delay_ms > 0:
            await asyncio.sleep(delay_ms / 1000)

    completed = sum(1 for item in entries if item["status"] == "completed")
    failed = sum(1 for item in entries if item["status"] == "failed")

    await runs.update_one(
        {"_id": ObjectId(run_id)},
        {
            "$set": {
                "entries": entries,
                "status": "completed" if failed == 0 else "failed",
                "finished_at": datetime.now(UTC),
                "aggregate_metrics": {
                    "entry_count": len(entries),
                    "completed_entries": completed,
                    "failed_entries": failed,
                },
            }
        },
    )