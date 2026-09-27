from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

import structlog
from bson import ObjectId

from ..core.background_work import track_background_work
from ..core.mongo import (
    find_evaluation_set_entry_or_raise,
    get_evaluation_runs_collection,
    get_evaluation_sets_collection,
)
from ..schemas.summary_spec import SummarySpec
from .metrics import (
    compute_cross_metrics,
    compute_deepeval_metrics,
    compute_pairwise_cross_deepeval_metrics,
)

log = structlog.get_logger(__name__)


async def _store_deepeval_status(run_id: str, fields: dict[str, Any]) -> None:
    prefixed = {f"aggregate_metrics.deepeval.{key}": value for key, value in fields.items()}
    await get_evaluation_runs_collection().update_one({"_id": ObjectId(run_id)}, {"$set": prefixed})


@track_background_work("deepeval_pass")
async def run_deepeval_pass(run_id: str) -> None:
    """Scores every completed entry that has no GEval result yet, one entry at a time.

    Each entry is written back — and the pass heartbeat refreshed — the moment it is judged, so
    a restart mid-pass resumes from whatever is left rather than paying the judge twice.
    """
    structlog.contextvars.bind_contextvars(run_id=run_id)
    try:
        await _score_run_entries(run_id)
    finally:
        structlog.contextvars.unbind_contextvars("run_id")


async def _score_run_entries(run_id: str) -> None:
    runs = get_evaluation_runs_collection()
    sets = get_evaluation_sets_collection()

    run_doc = await runs.find_one(
        {"_id": ObjectId(run_id)},
        {
            "evaluation_set_id": 1,
            "summary_spec": 1,
            "entries.entry_id": 1,
            "entries.status": 1,
            "entries.golden_summary": 1,
            "entries.ai_summary": 1,
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

    output_format = SummarySpec.model_validate(run_doc["summary_spec"]).output_format
    started_at = datetime.now(UTC)
    await _store_deepeval_status(
        run_id, {"status": "running", "started_at": started_at, "heartbeat_at": started_at}
    )

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
            source_text = (await find_evaluation_set_entry_or_raise(set_id, entry_id))["input_text"]

            deepeval_metrics, rouge_meteor, pairwise = await asyncio.gather(
                compute_deepeval_metrics(
                    summary_text=summary_text,
                    source_text=source_text,
                    output_format=output_format,
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
                        "aggregate_metrics.deepeval.heartbeat_at": datetime.now(UTC),
                    }
                },
            )
            updated_entries += 1
    except Exception as exc:
        log.exception("deepeval failed")
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
