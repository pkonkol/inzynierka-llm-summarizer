from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import structlog
from bson import ObjectId

from ..core.background_work import track_background_work
from ..core.mongo import (
    find_evaluation_set_entry,
    get_evaluation_runs_collection,
    get_evaluation_sets_collection,
)
from ..services.run_metrics import (
    compute_cross_metrics,
    compute_statistical_metrics,
    join_takeaways,
)
from .llm import generate_summary

log = structlog.get_logger(__name__)

_TERMINAL_ENTRY_STATUSES = frozenset({"completed", "failed"})


def summarize_entry_statuses(entry_statuses: list[str]) -> tuple[str, int, int, int]:
    """-> (run_status, entry_count, completed_entries, failed_entries).

    A run is complete once every entry reached a terminal state, whatever the mix: individual
    failures are reported through failed_entries rather than by discarding the whole run. It is
    failed only when nothing came out of it at all.
    """
    completed = sum(1 for status in entry_statuses if status == "completed")
    failed = sum(1 for status in entry_statuses if status == "failed")
    run_status = "completed" if completed > 0 else "failed"
    return run_status, len(entry_statuses), completed, failed


async def fetch_source_entry(set_id: str, entry_id: str) -> dict:
    entry = await find_evaluation_set_entry(set_id, entry_id)
    if entry is None:
        raise ValueError(f"evaluation set {set_id} has no entry {entry_id}")
    return entry


@track_background_work("evaluation_run")
async def run_evaluation_batch(run_id: str) -> None:
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
                    "aggregate_metrics.error": "Evaluation set not found",
                }
            },
        )
        return

    await runs.update_one(
        {"_id": ObjectId(run_id)},
        {"$set": {"status": "running", "finished_at": None, "heartbeat_at": datetime.now(UTC)}},
    )

    delay_ms = run_doc["rate_limit_delay_ms"]
    set_id = run_doc["evaluation_set_id"]

    remaining_entries = [
        entry for entry in run_doc["entries"] if entry["status"] not in _TERMINAL_ENTRY_STATUSES
    ]
    log.info(
        "evaluation run starting",
        run_id=run_id,
        remaining_entries=len(remaining_entries),
        total_entries=len(run_doc["entries"]),
    )

    for run_entry in remaining_entries:
        entry_id = run_entry["entry_id"]
        update: dict = {}

        await runs.update_one(
            {"_id": ObjectId(run_id), "entries.entry_id": entry_id},
            {"$set": {"entries.$.status": "running", "heartbeat_at": datetime.now(UTC)}},
        )

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

        entry_write: dict = {f"entries.$.{key}": value for key, value in update.items()}
        entry_write["heartbeat_at"] = datetime.now(UTC)
        if update["status"] == "completed":
            entry_write["resume_attempts"] = 0

        await runs.update_one(
            {"_id": ObjectId(run_id), "entries.entry_id": entry_id},
            {"$set": entry_write},
        )

        if delay_ms > 0:
            await asyncio.sleep(delay_ms / 1000)

    final_doc = await runs.find_one({"_id": ObjectId(run_id)}, {"entries.status": 1})
    if final_doc is None:
        log.info("evaluation run deleted while running", run_id=run_id)
        return

    entry_statuses = [entry["status"] for entry in final_doc["entries"]]
    if any(status not in _TERMINAL_ENTRY_STATUSES for status in entry_statuses):
        log.warning("evaluation run ended with entries unfinished", run_id=run_id)
        return

    run_status, entry_count, completed, failed = summarize_entry_statuses(entry_statuses)

    await runs.update_one(
        {"_id": ObjectId(run_id)},
        {
            "$set": {
                "status": run_status,
                "finished_at": datetime.now(UTC),
                "aggregate_metrics.entry_count": entry_count,
                "aggregate_metrics.completed_entries": completed,
                "aggregate_metrics.failed_entries": failed,
            }
        },
    )
    log.info(
        "evaluation run finished",
        run_id=run_id,
        status=run_status,
        completed_entries=completed,
        failed_entries=failed,
    )
