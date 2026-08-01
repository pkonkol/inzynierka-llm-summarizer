from __future__ import annotations

import asyncio
from datetime import UTC, datetime
import logging

from bson import ObjectId

from app.core.mongo import get_evaluation_runs_collection, get_evaluation_sets_collection
from ..services.run_metrics import compute_deterministic_metrics, join_takeaways
from app.services.llm import generate_summary

logger = logging.getLogger(__name__)

async def run_evaluation_batch(run_id: str) -> None:
    runs = get_evaluation_runs_collection()
    sets = get_evaluation_sets_collection()

    logger.debug("run_id: %s", run_id)

    run_doc = await runs.find_one({"_id": ObjectId(run_id)})
    if run_doc is None:
        return

    # TODO nie zawiesza sie na running jak gdzies tu sie wywali
    logger.debug("run id: %s\nrun_doc:%s", run_id, run_doc)

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

    await runs.update_one(
        {"_id": ObjectId(run_id)},
        {"$set": {"status": "running"}},
    )

    # entries = run_doc["entries"]
    entries = set_doc["entries"]
    delay_ms = run_doc.get("rate_limit_delay_ms", 0)

    # logger.debug("about to generate evaluation batch\nentries: %s\ndelay:%s", entries, delay_ms)

    for entry in entries:
        from pprint import pprint
        logger.debug("entry: %s", pprint(entry))
        try:
            input_text = entry["input_text"]
            title = entry["source_meta"]["title"]
            input_payload = {
                "text": input_text,
                "title": title,
            }
            # logger.debug("generating summary with payload: %s\n%s", input_payload, entry)

            result = await generate_summary(
                input=input_payload,
                source_url=entry.get("source_meta", {}).get("url") or "", # TODO wyjebac fallbacka
                model_name=run_doc["model_name"],
                model_provider=run_doc["model_provider"],
                language=run_doc["language"],
                mode=run_doc["summary_mode"],
            )

            # logger.debug("summary generated for entry: %s", result)

            summary_text = result["summary"] # TODO check all fallbacks for removal
            takeaways = result["key_takeaways"]

            basic_metrics = await compute_deterministic_metrics(
                summary_text=summary_text,
                takeaways_text=join_takeaways(takeaways=takeaways),
                source_text=input_text,
            )

            entry["ai_summary"] = summary_text
            entry["ai_key_takeaways"] = takeaways
            entry["ai_metrics"] = basic_metrics
            entry["cross_metrics"] = None
            entry["status"] = "completed"
            entry["error"] = None
        except Exception as exc:
            entry["status"] = "failed"
            entry["error"] = str(exc)
            logger.error("Failed creating entry: [%s] for run: %s, entry: %s",entry["title"], run_id, entry)

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