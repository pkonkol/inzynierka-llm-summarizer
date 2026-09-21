from __future__ import annotations

import asyncio
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any

import structlog
from bson import ObjectId
from deepeval.test_case import LLMTestCase

from ..core.background_work import track_background_work
from ..core.config import settings
from ..core.executors import run_blocking
from ..core.mongo import find_evaluation_set_entry, get_evaluation_sets_collection
from .metrics.deepeval import SUMMARY_INPUT_SPECS, SUMMARY_SPECS, evaluate_geval
from .metrics.statistical import source_metrics, summary_metrics

log = structlog.get_logger(__name__)


async def build_golden_metrics(input_text: str, golden_summary: str) -> dict[str, Any]:
    def statistical() -> dict[str, Any]:
        return {
            "source": source_metrics(input_text),
            "summary": summary_metrics(golden_summary, input_text),
        }

    work = [
        *((spec, LLMTestCase(input="", actual_output=golden_summary)) for spec in SUMMARY_SPECS),
        *(
            (spec, LLMTestCase(input=input_text, actual_output=golden_summary))
            for spec in SUMMARY_INPUT_SPECS
        ),
    ]
    judged, stats = await asyncio.gather(
        evaluate_geval(settings, work),
        run_blocking(statistical),
    )

    return {**stats, "deepeval": [asdict(x) for x in judged]}


async def _store_pass_status(set_id: str, fields: dict[str, Any]) -> None:
    prefixed = {f"golden_metrics_pass.{key}": value for key, value in fields.items()}
    await get_evaluation_sets_collection().update_one({"_id": ObjectId(set_id)}, {"$set": prefixed})


@track_background_work("golden_metrics_pass")
async def run_golden_metrics_pass(set_id: str) -> None:
    """Fills in golden_metrics for every entry that lacks one, one entry at a time.

    Each entry is written back — and the pass heartbeat refreshed — the moment it is judged, so
    a restart mid-pass resumes from whatever is left rather than redoing completed entries.
    """
    structlog.contextvars.bind_contextvars(set_id=set_id)
    try:
        document = await get_evaluation_sets_collection().find_one(
            {"_id": ObjectId(set_id)},
            {"entries.entry_id": 1, "entries.golden_metrics": 1},
        )
        if document is None:
            # Reachable: DELETE /evaluation-sets/{id} can land while this pass is still queued.
            log.info("golden metrics pass: evaluation set deleted before it could run")
            return

        pending_entry_ids = [
            entry["entry_id"] for entry in document["entries"] if entry["golden_metrics"] is None
        ]
        await _store_pass_status(set_id, {"status": "running", "started_at": datetime.now(UTC)})

        for entry_id in pending_entry_ids:
            entry = await find_evaluation_set_entry(set_id, entry_id)
            # TODO: only reachable today via a whole-set delete mid-pass — and then the set is
            # gone, so nothing can observe entries_with_metrics staying below entry_count. Revisit
            # if entries ever get their own delete endpoint, since that would make it observable.
            if entry is None:
                continue
            metrics = await build_golden_metrics(
                input_text=entry["input_text"], golden_summary=entry["golden_summary"]
            )
            await get_evaluation_sets_collection().update_one(
                {"_id": ObjectId(set_id), "entries.entry_id": entry_id},
                {
                    "$set": {
                        "entries.$.golden_metrics": metrics,
                        "golden_metrics_pass.heartbeat_at": datetime.now(UTC),
                    }
                },
            )
    except Exception as exc:
        log.exception("golden metrics pass failed")
        await _store_pass_status(
            set_id, {"status": "failed", "error": str(exc), "finished_at": datetime.now(UTC)}
        )
        raise
    else:
        await _store_pass_status(set_id, {"status": "completed", "finished_at": datetime.now(UTC)})
    finally:
        structlog.contextvars.unbind_contextvars("set_id")
