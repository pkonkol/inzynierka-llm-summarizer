from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import structlog
from bson import ObjectId

from ..core.background_work import track_background_work
from ..core.mongo import get_evaluation_runs_collection, get_evaluation_sets_collection
from ..services.run_metrics import (
    compute_cross_metrics,
    compute_statistical_metrics,
    join_takeaways,
)
from .llm import generate_summary

log = structlog.get_logger(__name__)


async def fetch_source_entry(set_id: str, entry_id: str) -> dict:
    """One set entry per round-trip; the whole entries array carries every input_text."""
    set_doc = await get_evaluation_sets_collection().find_one(
        {"_id": ObjectId(set_id), "entries.entry_id": entry_id},
        {"entries.$": 1},
    )
    if set_doc is None:
        raise ValueError(f"evaluation set {set_id} has no entry {entry_id}")
    return set_doc["entries"][0]


async def run_evaluation_batch(run_id: str) -> None:
    async with track_background_work("evaluation_run"):
        await _run_evaluation_batch(run_id)


async def _run_evaluation_batch(run_id: str) -> None:
    runs = get_evaluation_runs_collection()
    sets = get_evaluation_sets_collection()

    run_doc = await runs.find_one(
        {"_id": ObjectId(run_id)},
        {
            "evaluation_set_id": 1,
            "model_name": 1,
            "model_provider": 1,
            "language": 1,
            "summary_mode": 1,
            "skip_takeaways": 1,
            "rate_limit_delay_ms": 1,
            "entries.entry_id": 1,
            "entries.golden_summary": 1,
            "entries.status": 1,
        },
    )
    if run_doc is None:
        return

    set_doc = await sets.find_one({"_id": ObjectId(run_doc["evaluation_set_id"])}, {"_id": 1})
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

    delay_ms = run_doc["rate_limit_delay_ms"]
    set_id = run_doc["evaluation_set_id"]

    statuses: list[str] = []

    for run_entry in run_doc["entries"]:
        entry_id = run_entry["entry_id"]
        update: dict = {}

        try:
            source_entry = await fetch_source_entry(set_id, entry_id)
            summary = await generate_summary(
                input={"text": source_entry["input_text"], "title": source_entry["title"]},
                source_url=source_entry["url"],
                model_name=run_doc["model_name"],
                model_provider=run_doc["model_provider"],
                language=run_doc["language"],
                mode=run_doc["summary_mode"],
                skip_takeaways=run_doc.get("skip_takeaways", False),
            )

            summary_text = summary.summary
            takeaways = summary.key_takeaways

            update["ai_summary"] = summary_text
            update["ai_key_takeaways"] = takeaways
            update["ai_metrics"], update["cross_metrics"] = await asyncio.gather(
                compute_statistical_metrics(
                    summary_text=summary_text,
                    takeaways_text=join_takeaways(takeaways),
                    source_text=source_entry["input_text"],
                ),
                compute_cross_metrics(
                    reference_text=run_entry["golden_summary"],
                    summary_text=summary_text,
                ),
            )
            update["status"] = "completed"
            update["error"] = None
        except Exception as exc:
            update["status"] = "failed"
            update["error"] = str(exc)
            log.exception("evaluation entry failed", entry_id=entry_id, run_id=run_id)

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
