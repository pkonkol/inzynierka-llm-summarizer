from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import structlog
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from ..core.background_work import track_background_work
from ..core.mongo import (
    find_evaluation_set_entry,
    get_evaluation_runs_collection,
    get_evaluation_sets_collection,
)
from ..schemas.summary_spec import (
    ExplicitLength,
    MatchReferenceLength,
    ProcessingStrategy,
    SummarySpec,
    resolve_target_length,
)
from ..services.run_metrics import (
    compute_cross_metrics,
    compute_statistical_metrics,
    join_takeaways,
)
from .llm import generate_summary

log = structlog.get_logger(__name__)

_TERMINAL_ENTRY_STATUSES = frozenset({"completed", "failed"})

# The evaluation run's own SummarySpec/processing_strategy fields land in Phase 2 (see
# .scratch/claude_plans/dlugosc-i-rejestr-podsumowan-analiza.md and the approved implementation
# plan). Until then, this maps the still-untouched summary_mode field to the new strategy names
# and always resolves length against the entry's own golden_summary — operationally identical to
# what the match_reference policy will formalize in the schema.
_LEGACY_STRATEGY_MAP: dict[str, ProcessingStrategy] = {
    "simple": "direct",
    "sequential": "direct",
    "cascade": "extract_then_synthesize",
}


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


async def _mark_run_failed(runs: AsyncIOMotorCollection, run_id: str, error: str) -> None:
    await runs.update_one(
        {"_id": ObjectId(run_id)},
        {
            "$set": {
                "status": "failed",
                "finished_at": datetime.now(UTC),
                "aggregate_metrics.error": error,
            }
        },
    )


async def _summarize_one_entry(run_doc: dict, run_entry: dict) -> dict:
    """Everything written back about a single entry, including the failure case."""
    entry_id = run_entry["entry_id"]
    try:
        source_entry = await fetch_source_entry(run_doc["evaluation_set_id"], entry_id)
        target_words, target_sentences = resolve_target_length(
            MatchReferenceLength(), input_words=0, golden_summary=run_entry["golden_summary"]
        )
        spec = SummarySpec(
            length=ExplicitLength(target_words=target_words, target_sentences=target_sentences)
        )
        summary = await generate_summary(
            input={"text": source_entry["input_text"], "title": source_entry["title"]},
            source_url=source_entry["url"],
            model_name=run_doc["model_name"],
            model_provider=run_doc["model_provider"],
            language=run_doc["language"],
            spec=spec,
            strategy=_LEGACY_STRATEGY_MAP.get(run_doc["summary_mode"], "direct"),
        )
        summary_text = summary.summary if summary.summary is not None else ""
        ai_metrics, cross_metrics = await asyncio.gather(
            compute_statistical_metrics(
                summary_text=summary_text,
                takeaways_text=join_takeaways(summary.key_takeaways),
                source_text=source_entry["input_text"],
            ),
            compute_cross_metrics(
                reference_text=run_entry["golden_summary"],
                summary_text=summary_text,
            ),
        )
    except Exception as exc:
        log.exception("evaluation entry failed", entry_id=entry_id, run_id=str(run_doc["_id"]))
        return {"status": "failed", "error": str(exc)}

    return {
        "status": "completed",
        "error": None,
        "ai_summary": summary.summary,
        "ai_key_takeaways": summary.key_takeaways,
        "ai_metrics": ai_metrics,
        "cross_metrics": cross_metrics,
    }


async def _finalize_run(runs: AsyncIOMotorCollection, run_id: str) -> None:
    """Counts from the stored document, because a resumed loop only touched what was left."""
    final_doc = await runs.find_one({"_id": ObjectId(run_id)}, {"entries.status": 1})
    if final_doc is None:
        # Reachable: DELETE /runs/{run_id} can land while the loop is still working.
        log.info("evaluation run deleted while running", run_id=run_id)
        return

    entry_statuses = [entry["status"] for entry in final_doc["entries"]]
    if any(status not in _TERMINAL_ENTRY_STATUSES for status in entry_statuses):
        log.warning("evaluation run ended with entries unfinished", run_id=run_id)
        return

    run_status, entry_count, completed, failed = summarize_entry_statuses(entry_statuses)
    await runs.update_one(
        {"_id": ObjectId(run_id)},
        # Dotted keys, so finishing a run does not wipe aggregate_metrics.deepeval written by a
        # GEval pass that already ran.
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

    if await sets.find_one({"_id": ObjectId(run_doc["evaluation_set_id"])}, {"_id": 1}) is None:
        await _mark_run_failed(runs, run_id, "Evaluation set not found")
        return

    await runs.update_one(
        {"_id": ObjectId(run_id)},
        {"$set": {"status": "running", "finished_at": None, "heartbeat_at": datetime.now(UTC)}},
    )

    remaining = [e for e in run_doc["entries"] if e["status"] not in _TERMINAL_ENTRY_STATUSES]
    log.info(
        "evaluation run starting",
        run_id=run_id,
        remaining_entries=len(remaining),
        total_entries=len(run_doc["entries"]),
    )

    for run_entry in remaining:
        entry_id = run_entry["entry_id"]
        entry_filter = {"_id": ObjectId(run_id), "entries.entry_id": entry_id}

        await runs.update_one(
            entry_filter,
            {"$set": {"entries.$.status": "running", "heartbeat_at": datetime.now(UTC)}},
        )

        result = await _summarize_one_entry(run_doc, run_entry)

        write = {f"entries.$.{key}": value for key, value in result.items()}
        write["heartbeat_at"] = datetime.now(UTC)
        if result["status"] == "completed":
            # Progress earns the attempt budget back, so the cap counts attempts that achieved
            # nothing rather than reclamations of a run that was working the whole time.
            write["resume_attempts"] = 0
        await runs.update_one(entry_filter, {"$set": write})

        if run_doc["rate_limit_delay_ms"] > 0:
            await asyncio.sleep(run_doc["rate_limit_delay_ms"] / 1000)

    await _finalize_run(runs, run_id)
