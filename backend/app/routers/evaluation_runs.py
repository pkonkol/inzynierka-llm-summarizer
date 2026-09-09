# routers/evaluation_runs.py — /api/v1/research routes for evaluation runs

from datetime import UTC, datetime

import structlog
from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pymongo import DESCENDING

from ..core.auth import require_auth
from ..core.mongo import get_evaluation_runs_collection, get_evaluation_sets_collection
from ..schemas.evaluation_run_api import (
    DeepevalQueuedResponse,
    EvaluationRunCreateRequest,
    EvaluationRunCreateResponse,
    EvaluationRunDeletedResponse,
    EvaluationRunEntriesResponse,
    EvaluationRunEntryResponse,
    EvaluationRunListItemResponse,
    EvaluationRunResponse,
    EvaluationRunResumeResponse,
)
from ..schemas.evaluation_run_db import EvaluationRunDocument, EvaluationRunEntryDocument
from ..services.evaluation_run_metrics import compute_run_deepeval_metrics
from ..services.evaluation_runner import run_evaluation_batch
from ..services.startup_resume import claim_evaluation_run_for_resume
from .evaluation_sets import find_evaluation_set_or_404

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/research", tags=["research"])


async def find_evaluation_run_or_404(run_id: str, projection: dict | None = None) -> dict:
    document = await get_evaluation_runs_collection().find_one(
        {"_id": ObjectId(run_id)}, projection
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Evaluation run not found")
    return document


@router.post(
    "/evaluation-sets/{set_id}/runs",
    response_model=EvaluationRunCreateResponse,
    dependencies=[Depends(require_auth)],
)
async def create_evaluation_run(
    set_id: str,
    payload: EvaluationRunCreateRequest,
    background_tasks: BackgroundTasks,
) -> EvaluationRunCreateResponse:
    runs = get_evaluation_runs_collection()

    set_document = await find_evaluation_set_or_404(
        set_id, {"entries.entry_id": 1, "entries.golden_summary": 1, "name": 1}
    )

    created_at = datetime.now(UTC)

    entries = [
        EvaluationRunEntryDocument(
            entry_id=entry["entry_id"],
            golden_summary=entry["golden_summary"],
        )
        for entry in set_document["entries"]
    ]

    document = EvaluationRunDocument(
        evaluation_set_id=str(set_document["_id"]),
        evaluation_set_name=set_document["name"],
        model_provider=payload.model_provider,
        model_name=payload.model_name,
        summary_mode=payload.summary_mode,
        language=payload.language,
        rate_limit_delay_ms=payload.rate_limit_delay_ms,
        skip_takeaways=payload.skip_takeaways,
        status="pending",
        created_at=created_at,
        heartbeat_at=created_at,
        finished_at=None,
        entries=entries,
        aggregate_metrics={},
    )

    result = await runs.insert_one(document.model_dump())
    run_id = str(result.inserted_id)

    background_tasks.add_task(run_evaluation_batch, run_id)

    return EvaluationRunCreateResponse(
        evaluation_run_id=run_id,
        status="pending",
        created_at=created_at,
    )


@router.get(
    "/evaluation-sets/{set_id}/runs",
    response_model=list[EvaluationRunListItemResponse],
)
async def list_evaluation_runs(set_id: str) -> list[EvaluationRunListItemResponse]:
    runs = get_evaluation_runs_collection()

    documents = await runs.aggregate(
        [
            {"$match": {"evaluation_set_id": set_id}},
            {"$sort": {"created_at": DESCENDING}},
            {
                "$project": {
                    "evaluation_set_id": 1,
                    "evaluation_set_name": 1,
                    "model_provider": 1,
                    "model_name": 1,
                    "summary_mode": 1,
                    "language": 1,
                    "status": 1,
                    "created_at": 1,
                    "finished_at": 1,
                    "entry_count": {"$size": "$entries"},
                }
            },
        ]
    ).to_list(length=1000)

    return [
        EvaluationRunListItemResponse.model_validate({**doc, "evaluation_run_id": str(doc["_id"])})
        for doc in documents
    ]


@router.get("/runs/{run_id}", response_model=EvaluationRunResponse)
async def get_evaluation_run(run_id: str) -> EvaluationRunResponse:
    documents = (
        await get_evaluation_runs_collection()
        .aggregate(
            [
                {"$match": {"_id": ObjectId(run_id)}},
                {
                    "$project": {
                        "evaluation_set_id": 1,
                        "evaluation_set_name": 1,
                        "model_provider": 1,
                        "model_name": 1,
                        "summary_mode": 1,
                        "language": 1,
                        "status": 1,
                        "created_at": 1,
                        "finished_at": 1,
                        "aggregate_metrics": 1,
                        "skip_takeaways": 1,
                        "entry_count": {"$size": "$entries"},
                    }
                },
            ]
        )
        .to_list(length=1)
    )

    if not documents:
        raise HTTPException(status_code=404, detail="Evaluation run not found")

    document = documents[0]

    return EvaluationRunResponse(
        id=str(document["_id"]),
        evaluation_set_id=document["evaluation_set_id"],
        evaluation_set_name=document["evaluation_set_name"],
        model_provider=document["model_provider"],
        model_name=document["model_name"],
        summary_mode=document["summary_mode"],
        language=document["language"],
        status=document["status"],
        created_at=document["created_at"],
        finished_at=document.get("finished_at"),
        entry_count=document["entry_count"],
        skip_takeaways=document.get("skip_takeaways", False),
        aggregate_metrics=document.get("aggregate_metrics", {}),
    )


@router.get("/runs/{run_id}/entries", response_model=EvaluationRunEntriesResponse)
async def get_evaluation_run_entries(run_id: str) -> EvaluationRunEntriesResponse:
    sets = get_evaluation_sets_collection()

    run_document = await find_evaluation_run_or_404(run_id, {"entries": 1, "evaluation_set_id": 1})

    set_document = await sets.find_one(
        {"_id": ObjectId(run_document["evaluation_set_id"])},
        {"entries.entry_id": 1, "entries.title": 1, "entries.url": 1, "entries.golden_metrics": 1},
    )
    if set_document is None:
        raise HTTPException(status_code=404, detail="Evaluation set not found")

    set_entries_by_id = {entry["entry_id"]: entry for entry in set_document["entries"]}

    # title/url/golden_metrics live on the set entry, everything else on the run entry.
    entries = [
        EvaluationRunEntryResponse.model_validate(
            {**set_entries_by_id[run_entry["entry_id"]], **run_entry}
        )
        for run_entry in run_document["entries"]
    ]

    return EvaluationRunEntriesResponse(entries=entries)


@router.post(
    "/runs/{run_id}/deepeval",
    response_model=DeepevalQueuedResponse,
    dependencies=[Depends(require_auth)],
)
async def evaluate_run_deepeval(
    run_id: str,
    background_tasks: BackgroundTasks,
) -> DeepevalQueuedResponse:
    document = await find_evaluation_run_or_404(run_id, {"status": 1})

    if document["status"] in {"pending", "running"}:
        raise HTTPException(
            status_code=409,
            detail="Evaluation run must be finished before running GEval",
        )

    background_tasks.add_task(compute_run_deepeval_metrics, run_id)

    return DeepevalQueuedResponse(status="queued", run_id=run_id)


@router.post(
    "/runs/{run_id}/resume",
    response_model=EvaluationRunResumeResponse,
    dependencies=[Depends(require_auth)],
)
async def resume_evaluation_run(
    run_id: str,
    background_tasks: BackgroundTasks,
) -> EvaluationRunResumeResponse:
    document = await find_evaluation_run_or_404(run_id, {"status": 1, "resume_attempts": 1})

    if document["status"] == "completed":
        raise HTTPException(status_code=409, detail="Evaluation run has already finished")

    if not await claim_evaluation_run_for_resume(ObjectId(run_id), reset_attempts=True):
        raise HTTPException(status_code=409, detail="Evaluation run is still being processed")

    background_tasks.add_task(run_evaluation_batch, run_id)
    log.info("evaluation run resume requested", run_id=run_id)

    return EvaluationRunResumeResponse(
        status="queued",
        evaluation_run_id=run_id,
        resume_attempts=document["resume_attempts"],
    )


@router.delete(
    "/runs/{run_id}",
    response_model=EvaluationRunDeletedResponse,
    dependencies=[Depends(require_auth)],
)
async def delete_evaluation_run(run_id: str) -> EvaluationRunDeletedResponse:
    result = await get_evaluation_runs_collection().delete_one({"_id": ObjectId(run_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Evaluation run not found")
    return EvaluationRunDeletedResponse(status="deleted", evaluation_run_id=run_id)
