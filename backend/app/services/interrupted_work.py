"""The lifecycle of background work — summarisation jobs, evaluation runs, golden-metrics passes
and GEval passes — once the process that owned it may have died.

`recover_interrupted_work` runs once in the lifespan, before the app serves anything. Because
this process has just started, nothing it finds unfinished can belong to it, so the startup path
takes work however recent its heartbeat is — waiting out a staleness window would mean a run
killed a minute before the restart is never picked up at all.

The `claim_*` functions are the opposite case: the app is live and a loop may genuinely own the
work, so they check the heartbeat before taking it.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import structlog
from bson import ObjectId

from ..core.background_work import spawn_tracked_task
from ..core.config import settings
from ..core.mongo import (
    get_evaluation_runs_collection,
    get_evaluation_sets_collection,
    get_jobs_collection,
    stale_work_cutoff,
)
from .evaluation_run_metrics import run_deepeval_pass
from .evaluation_runner import run_evaluation_batch
from .evaluation_set_metrics import run_golden_metrics_pass
from .summarization_runner import run_summarization_job

log = structlog.get_logger(__name__)

_UNFINISHED = {"status": {"$in": ["pending", "running"]}}
_RESUMABLE = {**_UNFINISHED, "resume_attempts": {"$lt": settings.max_resume_attempts}}

_JOB_RESUME_FIELDS = {"job_id": 1}

_UNFINISHED_GOLDEN_METRICS = {"golden_metrics_pass.status": {"$in": ["pending", "running"]}}
_RESUMABLE_GOLDEN_METRICS = {
    **_UNFINISHED_GOLDEN_METRICS,
    "golden_metrics_pass.resume_attempts": {"$lt": settings.max_resume_attempts},
}

_UNFINISHED_DEEPEVAL = {"aggregate_metrics.deepeval.status": {"$in": ["pending", "running"]}}
_RESUMABLE_DEEPEVAL = {
    **_UNFINISHED_DEEPEVAL,
    "aggregate_metrics.deepeval.resume_attempts": {"$lt": settings.max_resume_attempts},
}


def _claim_update(*, reset_attempts: bool) -> dict[str, Any]:
    fields: dict[str, Any] = {"heartbeat_at": datetime.now(UTC)}
    if reset_attempts:
        fields["resume_attempts"] = 0
        return {"$set": fields}
    # Counted before the work runs, so a run that reliably kills the process still exhausts its
    # budget rather than being retried on every boot.
    return {"$set": fields, "$inc": {"resume_attempts": 1}}


async def claim_evaluation_run_for_resume(
    run_id: ObjectId, *, reset_attempts: bool = False
) -> bool:
    """Takes a run a live process may still hold. False means it is not ours to take.

    The heartbeat check is the point of this function and is never skipped: without it two
    loops end up writing the same entries.
    """
    query: dict[str, Any] = {
        "_id": run_id,
        **_UNFINISHED,
        "heartbeat_at": {"$lt": stale_work_cutoff()},
    }
    if not reset_attempts:
        query["resume_attempts"] = {"$lt": settings.max_resume_attempts}

    result = await get_evaluation_runs_collection().update_one(
        query, _claim_update(reset_attempts=reset_attempts)
    )
    return result.modified_count == 1


async def claim_golden_metrics_pass_for_queue(set_id: ObjectId) -> bool:
    """Takes a golden-metrics pass for POST .../golden-metrics. False means it is not claimable.

    A single atomic update_one instead of read-then-write: two requests racing on the same set
    must not both pass a check and both schedule run_golden_metrics_pass.
    """
    query: dict[str, Any] = {
        "_id": set_id,
        "$or": [
            {"golden_metrics_pass": None},
            {"golden_metrics_pass.status": "failed"},
            {
                **_UNFINISHED_GOLDEN_METRICS,
                "golden_metrics_pass.heartbeat_at": {"$lt": stale_work_cutoff()},
            },
        ],
    }
    result = await get_evaluation_sets_collection().update_one(
        query,
        {
            "$set": {
                "golden_metrics_pass.status": "pending",
                "golden_metrics_pass.heartbeat_at": datetime.now(UTC),
                "golden_metrics_pass.resume_attempts": 0,
                "golden_metrics_pass.error": None,
            }
        },
    )
    return result.modified_count == 1


async def claim_deepeval_pass_for_queue(run_id: ObjectId) -> bool:
    """Takes the GEval pass of a finished run for POST .../deepeval. False means it is not claimable.

    Atomic for the same reason as the golden-metrics claim: two clicks must not start two passes
    that both pay the judge for the same entries.
    """
    query: dict[str, Any] = {
        "_id": run_id,
        "status": {"$nin": ["pending", "running"]},
        "$or": [
            {"aggregate_metrics.deepeval": None},
            {"aggregate_metrics.deepeval.status": {"$in": ["completed", "failed"]}},
            {
                **_UNFINISHED_DEEPEVAL,
                "aggregate_metrics.deepeval.heartbeat_at": {"$lt": stale_work_cutoff()},
            },
        ],
    }
    result = await get_evaluation_runs_collection().update_one(
        query,
        {
            "$set": {
                "aggregate_metrics.deepeval": {
                    "status": "pending",
                    "heartbeat_at": datetime.now(UTC),
                    "resume_attempts": 0,
                }
            }
        },
    )
    return result.modified_count == 1


async def recover_interrupted_work() -> None:
    """Resumes what still has attempts left, then fails what is left over.

    The order is the point: the cleanup keys off a stale heartbeat, and resuming refreshes it,
    so work resumed here is out of the cleanup's reach. The other way round, every resumable
    document would be marked failed first.
    """
    await _resume_resumable_work()
    log.info(
        "stale work cleaned",
        stale_jobs=await cleanup_stale_pending_jobs(),
        stale_runs=await cleanup_stale_evaluation_runs(),
        stale_golden_metrics_passes=await cleanup_stale_golden_metrics_passes(),
        stale_deepeval_passes=await cleanup_stale_deepeval_passes(),
    )


async def _resume_resumable_work() -> None:
    """Restarts everything that still has resume attempts left."""
    runs = get_evaluation_runs_collection()
    jobs = get_jobs_collection()

    resumed_runs = 0
    async for run in runs.find(_RESUMABLE, {"_id": 1}):
        await runs.update_one({"_id": run["_id"]}, _claim_update(reset_attempts=False))
        spawn_tracked_task(run_evaluation_batch(str(run["_id"])), kind="evaluation_run")
        resumed_runs += 1

    resumed_jobs = 0
    async for job in jobs.find(_RESUMABLE, _JOB_RESUME_FIELDS):
        await jobs.update_one({"job_id": job["job_id"]}, _claim_update(reset_attempts=False))
        spawn_tracked_task(run_summarization_job(job["job_id"]), kind="summarization_job")
        resumed_jobs += 1

    resumed_golden_metrics_passes = 0
    sets = get_evaluation_sets_collection()
    async for evaluation_set in sets.find(_RESUMABLE_GOLDEN_METRICS, {"_id": 1}):
        set_id = str(evaluation_set["_id"])
        await sets.update_one(
            {"_id": evaluation_set["_id"]},
            {
                "$set": {"golden_metrics_pass.heartbeat_at": datetime.now(UTC)},
                "$inc": {"golden_metrics_pass.resume_attempts": 1},
            },
        )
        spawn_tracked_task(run_golden_metrics_pass(set_id), kind="golden_metrics_pass")
        resumed_golden_metrics_passes += 1

    resumed_deepeval_passes = 0
    async for run in runs.find(_RESUMABLE_DEEPEVAL, {"_id": 1}):
        await runs.update_one(
            {"_id": run["_id"]},
            {
                "$set": {"aggregate_metrics.deepeval.heartbeat_at": datetime.now(UTC)},
                "$inc": {"aggregate_metrics.deepeval.resume_attempts": 1},
            },
        )
        spawn_tracked_task(run_deepeval_pass(str(run["_id"])), kind="deepeval_pass")
        resumed_deepeval_passes += 1

    log.info(
        "interrupted work resumed",
        resumed_runs=resumed_runs,
        resumed_jobs=resumed_jobs,
        resumed_golden_metrics_passes=resumed_golden_metrics_passes,
        resumed_deepeval_passes=resumed_deepeval_passes,
    )


async def cleanup_stale_pending_jobs() -> int:
    result = await get_jobs_collection().update_many(
        {**_UNFINISHED, "heartbeat_at": {"$lt": stale_work_cutoff()}},
        {
            "$set": {
                "status": "failed",
                "error": "Job killed before completion (server restart)",
                "updated_at": datetime.now(UTC),
            }
        },
    )
    return result.modified_count


async def cleanup_stale_evaluation_runs() -> int:
    result = await get_evaluation_runs_collection().update_many(
        {**_UNFINISHED, "heartbeat_at": {"$lt": stale_work_cutoff()}},
        {
            "$set": {
                "status": "failed",
                "finished_at": datetime.now(UTC),
                "aggregate_metrics.error": "Evaluation run stopped responding and could not be resumed",
            }
        },
    )
    return result.modified_count


async def cleanup_stale_golden_metrics_passes() -> int:
    result = await get_evaluation_sets_collection().update_many(
        {
            **_UNFINISHED_GOLDEN_METRICS,
            "golden_metrics_pass.heartbeat_at": {"$lt": stale_work_cutoff()},
        },
        {
            "$set": {
                "golden_metrics_pass.status": "failed",
                "golden_metrics_pass.finished_at": datetime.now(UTC),
                "golden_metrics_pass.error": "Golden metrics pass stopped responding",
            }
        },
    )
    return result.modified_count


async def cleanup_stale_deepeval_passes() -> int:
    result = await get_evaluation_runs_collection().update_many(
        {
            **_UNFINISHED_DEEPEVAL,
            "aggregate_metrics.deepeval.heartbeat_at": {"$lt": stale_work_cutoff()},
        },
        {
            "$set": {
                "aggregate_metrics.deepeval.status": "failed",
                "aggregate_metrics.deepeval.finished_at": datetime.now(UTC),
                "aggregate_metrics.deepeval.error": "GEval pass stopped responding",
            }
        },
    )
    return result.modified_count
