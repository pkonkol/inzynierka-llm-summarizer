# routers/evaluation_runs.py — /api/v1/research routes for evaluation runs

from datetime import UTC, datetime

import structlog
from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pymongo import DESCENDING

from ..core.auth import require_auth
from ..core.config import settings
from ..core.mongo import get_evaluation_runs_collection, get_evaluation_sets_collection
from ..schemas.evaluation_run_api import (
    EvaluationRunCreateRequest,
    EvaluationRunCreateResponse,
    EvaluationRunDeletedResponse,
    EvaluationRunEntriesResponse,
    EvaluationRunEntryResponse,
    EvaluationRunListItemResponse,
    EvaluationRunResponse,
    EvaluationRunResumeResponse,
    JudgesQueuedResponse,
    JudgesRequest,
)
from ..schemas.evaluation_run_db import EvaluationRunDocument, EvaluationRunEntryDocument
from ..services.evaluation_run_metrics import aggregate_run_judgements_per_judge, run_judge_pass
from ..services.evaluation_runner import run_evaluation_batch
from ..services.interrupted_work import (
    claim_evaluation_run_for_resume,
    claim_judge_pass_for_queue,
)
from ..services.llm import validate_model, validate_processing_strategy
from ..services.metrics.fact_level_judges import JUDGE_CALIBRATION, JudgeModelRef
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
    try:
        validate_model(payload.model_provider, payload.model_name)
        validate_processing_strategy(payload.processing_strategy)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

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
        processing_strategy=payload.processing_strategy,
        summary_spec=payload.summary_spec,
        language=payload.language,
        rate_limit_delay_ms=payload.rate_limit_delay_ms,
        context_expansion_mode=payload.context_expansion_mode,
        git_sha=settings.git_sha,
        temperature=settings.llm_temperature,
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

    cursor = await runs.aggregate(
        [
            {"$match": {"evaluation_set_id": set_id}},
            {"$sort": {"created_at": DESCENDING}},
            {
                "$project": {
                    "evaluation_set_id": 1,
                    "evaluation_set_name": 1,
                    "model_provider": 1,
                    "model_name": 1,
                    "processing_strategy": 1,
                    "language": 1,
                    "status": 1,
                    "created_at": 1,
                    "finished_at": 1,
                    "entry_count": {"$size": "$entries"},
                }
            },
        ]
    )
    documents = await cursor.to_list(length=1000)

    return [
        EvaluationRunListItemResponse.model_validate({**doc, "evaluation_run_id": str(doc["_id"])})
        for doc in documents
    ]


@router.get("/runs/{run_id}", response_model=EvaluationRunResponse)
async def get_evaluation_run(run_id: str) -> EvaluationRunResponse:
    cursor = await get_evaluation_runs_collection().aggregate(
        [
            {"$match": {"_id": ObjectId(run_id)}},
            {
                "$project": {
                    "evaluation_set_id": 1,
                    "evaluation_set_name": 1,
                    "model_provider": 1,
                    "model_name": 1,
                    "processing_strategy": 1,
                    "summary_spec": 1,
                    "language": 1,
                    "context_expansion_mode": 1,
                    "status": 1,
                    "created_at": 1,
                    "finished_at": 1,
                    "aggregate_metrics": 1,
                    "git_sha": 1,
                    "temperature": 1,
                    "entry_count": {"$size": "$entries"},
                }
            },
        ]
    )
    documents = await cursor.to_list(length=1)

    if not documents:
        raise HTTPException(status_code=404, detail="Evaluation run not found")

    document = documents[0]
    entries = await _run_entries_with_set_fields(run_id)

    return EvaluationRunResponse(
        id=str(document["_id"]),
        evaluation_set_id=document["evaluation_set_id"],
        evaluation_set_name=document["evaluation_set_name"],
        model_provider=document["model_provider"],
        model_name=document["model_name"],
        processing_strategy=document["processing_strategy"],
        summary_spec=document["summary_spec"],
        language=document["language"],
        context_expansion_mode=document.get(
            "context_expansion_mode", "none"
        ),  # absent on runs created before context expansion
        status=document["status"],
        created_at=document["created_at"],
        finished_at=document.get("finished_at"),
        entry_count=document["entry_count"],
        git_sha=document.get("git_sha"),  # absent on runs created before provenance was stored
        temperature=document.get("temperature"),
        aggregate_metrics=document.get("aggregate_metrics", {}),
        judge_aggregates=aggregate_run_judgements_per_judge(entries),
        judge_calibration=JUDGE_CALIBRATION,
    )


@router.get("/runs/{run_id}/entries", response_model=EvaluationRunEntriesResponse)
async def get_evaluation_run_entries(run_id: str) -> EvaluationRunEntriesResponse:
    return EvaluationRunEntriesResponse(entries=await _run_entries_with_set_fields(run_id))


async def _run_entries_with_set_fields(run_id: str) -> list[EvaluationRunEntryResponse]:
    sets = get_evaluation_sets_collection()

    run_document = await find_evaluation_run_or_404(run_id, {"entries": 1, "evaluation_set_id": 1})

    set_document = await sets.find_one(
        {"_id": ObjectId(run_document["evaluation_set_id"])},
        {
            "entries.entry_id": 1,
            "entries.title": 1,
            "entries.url": 1,
            "entries.golden_metrics": 1,
            "entries.golden_judges": 1,
            "entries.keyfacts": 1,
        },
    )
    if set_document is None:
        raise HTTPException(status_code=404, detail="Evaluation set not found")

    set_entries_by_id = {entry["entry_id"]: entry for entry in set_document["entries"]}

    # title/url/golden_metrics/golden_judges/keyfacts live on the set entry, everything else on the run entry.
    return [
        EvaluationRunEntryResponse.model_validate(
            {**set_entries_by_id[run_entry["entry_id"]], **run_entry}
        )
        for run_entry in run_document["entries"]
    ]


@router.post(
    "/runs/{run_id}/judges",
    response_model=JudgesQueuedResponse,
    dependencies=[Depends(require_auth)],
)
async def judge_run(
    run_id: str,
    background_tasks: BackgroundTasks,
    request: JudgesRequest = JudgesRequest(),  # noqa: B008 - no body means the main judge
) -> JudgesQueuedResponse:
    judge_model = _supported_judge_model(request.judge_model)
    document = await find_evaluation_run_or_404(run_id, {"status": 1})

    if document["status"] in {"pending", "running"}:
        raise HTTPException(
            status_code=409, detail="Evaluation run must be finished before running the judges"
        )

    if not await claim_judge_pass_for_queue(ObjectId(run_id), judge_model):
        raise HTTPException(status_code=409, detail="A judge pass is already running for this run")

    background_tasks.add_task(run_judge_pass, run_id, judge_model, request.force)
    log.info("judge pass requested", run_id=run_id, judge_model=judge_model, force=request.force)

    return JudgesQueuedResponse(status="queued", run_id=run_id, judge_model=judge_model)


def _supported_judge_model(judge_model: str) -> str:
    try:
        judge = JudgeModelRef.parse(judge_model)
        validate_model(judge.provider, judge.name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return judge.model_id()


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
