"""Picks up evaluation runs and summarisation jobs left behind by a process that died.

Cloud Run reclaims instances and the container is memory-bound, so background work is killed
mid-flight often enough that it needs an answer. Work is claimed with a conditional update
whose filter repeats the staleness predicate, which is what stops a draining old revision and
a fresh one from running the same run twice.
"""

from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from datetime import UTC, datetime
from typing import Any

import structlog
from bson import ObjectId

from ..core.config import settings
from ..core.mongo import (
    get_evaluation_runs_collection,
    get_jobs_collection,
    stale_work_cutoff,
)
from .evaluation_runner import run_evaluation_batch
from .summarization_runner import run_summarization_job

log = structlog.get_logger(__name__)

# asyncio holds only weak references to running tasks, so a fire-and-forget task can be
# collected mid-flight; the same pattern guards the metrics tasks in summarization_runner.
_resumed_work_tasks: set[asyncio.Task] = set()

_UNFINISHED_RUN = {"status": {"$in": ["pending", "running"]}}


def _spawn(coroutine: Coroutine[Any, Any, None], *, kind: str) -> None:
    task = asyncio.create_task(coroutine)
    _resumed_work_tasks.add(task)

    def _forget(finished: asyncio.Task) -> None:
        _resumed_work_tasks.discard(finished)
        if not finished.cancelled() and (exc := finished.exception()) is not None:
            log.error("resumed work failed", kind=kind, exc_info=exc)

    task.add_done_callback(_forget)


async def claim_evaluation_run_for_resume(
    run_id: ObjectId, *, reset_attempts: bool = False
) -> bool:
    """Takes ownership of one stale run. False means someone else owns it or it is over budget.

    The freshness half of the filter is never skipped, including for a manual resume: bypassing
    it is how two loops end up writing the same entries. `reset_attempts` only lifts the attempt
    cap, which is a decision a person pressing a button is allowed to make.
    """
    query: dict[str, Any] = {
        "_id": run_id,
        **_UNFINISHED_RUN,
        "heartbeat_at": {"$lt": stale_work_cutoff()},
    }
    fields: dict[str, Any] = {
        "status": "running",
        "heartbeat_at": datetime.now(UTC),
        "finished_at": None,
    }
    update: dict[str, Any] = {"$set": fields}

    if reset_attempts:
        fields["resume_attempts"] = 0
    else:
        query["resume_attempts"] = {"$lt": settings.max_resume_attempts}
        # Counted before the work starts, so a run that reliably kills the process still
        # exhausts its budget instead of being retried on every boot.
        update["$inc"] = {"resume_attempts": 1}

    result = await get_evaluation_runs_collection().update_one(query, update)
    return result.modified_count == 1


async def claim_summarization_job_for_resume(job_id: str) -> bool:
    result = await get_jobs_collection().update_one(
        {
            "job_id": job_id,
            "status": "pending",
            "heartbeat_at": {"$lt": stale_work_cutoff()},
            "resume_attempts": {"$lt": settings.max_resume_attempts},
        },
        {"$set": {"heartbeat_at": datetime.now(UTC)}, "$inc": {"resume_attempts": 1}},
    )
    return result.modified_count == 1


async def resume_interrupted_work() -> None:
    """Claims and restarts everything resumable. Must run before the stale-work cleanup."""
    cutoff = stale_work_cutoff()
    attempt_limit = {"resume_attempts": {"$lt": settings.max_resume_attempts}}

    resumed_runs = 0
    async for run in get_evaluation_runs_collection().find(
        {**_UNFINISHED_RUN, "heartbeat_at": {"$lt": cutoff}, **attempt_limit}, {"_id": 1}
    ):
        if await claim_evaluation_run_for_resume(run["_id"]):
            _spawn(run_evaluation_batch(str(run["_id"])), kind="evaluation_run")
            resumed_runs += 1

    resumed_jobs = 0
    async for job in get_jobs_collection().find(
        {
            "status": "pending",
            "heartbeat_at": {"$lt": cutoff},
            "language": {"$exists": True},
            **attempt_limit,
        },
        {
            "job_id": 1,
            "source_url": 1,
            "model_name": 1,
            "model_provider": 1,
            "language": 1,
            "summary_mode": 1,
            "run_deepeval": 1,
        },
    ):
        if await claim_summarization_job_for_resume(job["job_id"]):
            _spawn(
                run_summarization_job(
                    job["job_id"],
                    job["source_url"],
                    job["model_name"],
                    job["model_provider"],
                    job["language"],
                    job["summary_mode"],
                    job["run_deepeval"],
                ),
                kind="summarization_job",
            )
            resumed_jobs += 1

    log.info("interrupted work resumed", resumed_runs=resumed_runs, resumed_jobs=resumed_jobs)
