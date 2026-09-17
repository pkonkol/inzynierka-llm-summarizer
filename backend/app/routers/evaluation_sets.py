# routers/evaluation_sets.py — /api/v1/research routes for evaluation sets

from datetime import UTC, datetime
from uuid import uuid4

import structlog
from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pymongo import DESCENDING

from ..core.auth import require_auth
from ..core.mongo import (
    find_evaluation_set_entry,
    get_evaluation_runs_collection,
    get_evaluation_sets_collection,
    stale_work_cutoff,
)
from ..schemas.evaluation_set_api import (
    EvaluationSetCreateResponse,
    EvaluationSetDeletedResponse,
    EvaluationSetDetailResponse,
    EvaluationSetEntryImport,
    EvaluationSetEntryInputTextResponse,
    EvaluationSetEntryResponse,
    EvaluationSetExportResponse,
    EvaluationSetImportRequest,
    EvaluationSetListItemResponse,
    GoldenMetricsPassQueuedResponse,
    GoldenMetricsPassResponse,
)
from ..schemas.evaluation_set_db import (
    EvaluationSetDocument,
    EvaluationSetEntryDocument,
    GoldenMetricsPassDocument,
    GoldenMetricsPassStatus,
)
from ..services.evaluation_set_metrics import run_golden_metrics_pass

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/research", tags=["research"])

_ENTRIES_WITH_METRICS_EXPR = {
    "$size": {
        "$filter": {
            "input": "$entries",
            "as": "entry",
            "cond": {"$ne": ["$$entry.golden_metrics", None]},
        }
    }
}


def _golden_metrics_status(document: dict) -> GoldenMetricsPassStatus | None:
    """None both for a set imported before this field existed and for one Mongo omitted from
    a $project because the field was never set — same meaning either way."""
    golden_metrics_pass = document.get("golden_metrics_pass")
    return golden_metrics_pass["status"] if golden_metrics_pass else None


async def find_evaluation_set_or_404(set_id: str, projection: dict | None = None) -> dict:
    document = await get_evaluation_sets_collection().find_one(
        {"_id": ObjectId(set_id)}, projection
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Evaluation set not found")
    return document


@router.post(
    "/evaluation-sets",
    response_model=EvaluationSetCreateResponse,
    dependencies=[Depends(require_auth)],
)
async def create_evaluation_set(
    payload: EvaluationSetImportRequest,
    background_tasks: BackgroundTasks,
) -> EvaluationSetCreateResponse:
    collection = get_evaluation_sets_collection()
    created_at = datetime.now(UTC)

    entries = [
        EvaluationSetEntryDocument(
            entry_id=str(uuid4()),
            input_text=entry.input_text,
            golden_summary=entry.golden_summary,
            title=entry.title,
            url=entry.url,
            golden_metrics=entry.golden_metrics,
        )
        for entry in payload.entries
    ]
    needs_golden_metrics_pass = payload.compute_golden_metrics and any(
        entry.golden_metrics is None for entry in entries
    )

    document = EvaluationSetDocument(
        name=payload.name,
        language=payload.language,
        created_at=created_at,
        entries=entries,
        golden_metrics_pass=GoldenMetricsPassDocument(
            status="pending" if needs_golden_metrics_pass else "skipped",
            heartbeat_at=created_at,
        ),
    )

    result = await collection.insert_one(document.model_dump())
    evaluation_set_id = str(result.inserted_id)

    if needs_golden_metrics_pass:
        background_tasks.add_task(run_golden_metrics_pass, evaluation_set_id)

    return EvaluationSetCreateResponse(
        evaluation_set_id=evaluation_set_id,
        name=payload.name,
        language=payload.language,
        entry_count=len(entries),
        created_at=created_at,
    )


@router.get("/evaluation-sets", response_model=list[EvaluationSetListItemResponse])
async def list_evaluation_sets() -> list[EvaluationSetListItemResponse]:
    collection = get_evaluation_sets_collection()

    documents = await collection.aggregate(
        [
            {"$sort": {"created_at": DESCENDING}},
            {
                "$project": {
                    "name": 1,
                    "language": 1,
                    "created_at": 1,
                    "golden_metrics_pass": 1,
                    "entry_count": {"$size": "$entries"},
                    "entries_with_metrics": _ENTRIES_WITH_METRICS_EXPR,
                }
            },
        ]
    ).to_list(length=1000)

    run_counts = {
        doc["_id"]: doc["run_count"]
        async for doc in get_evaluation_runs_collection().aggregate(
            [{"$group": {"_id": "$evaluation_set_id", "run_count": {"$sum": 1}}}]
        )
    }

    return [
        EvaluationSetListItemResponse(
            evaluation_set_id=str(doc["_id"]),
            name=doc["name"],
            language=doc["language"],
            entry_count=doc["entry_count"],
            entries_with_metrics=doc["entries_with_metrics"],
            golden_metrics_status=_golden_metrics_status(doc),
            run_count=run_counts.get(str(doc["_id"]), 0),
            created_at=doc["created_at"],
        )
        for doc in documents
    ]


@router.get("/evaluation-sets/{set_id}", response_model=EvaluationSetDetailResponse)
async def get_evaluation_set(set_id: str) -> EvaluationSetDetailResponse:
    document = await find_evaluation_set_or_404(set_id, {"entries.input_text": 0})

    return EvaluationSetDetailResponse(
        evaluation_set_id=str(document["_id"]),
        name=document["name"],
        language=document["language"],
        created_at=document["created_at"],
        entries=[EvaluationSetEntryResponse.model_validate(entry) for entry in document["entries"]],
    )


@router.get("/evaluation-sets/{set_id}/export", response_model=EvaluationSetExportResponse)
async def export_evaluation_set(set_id: str) -> EvaluationSetExportResponse:
    document = await find_evaluation_set_or_404(set_id)

    return EvaluationSetExportResponse(
        name=document["name"],
        language=document["language"],
        entries=[EvaluationSetEntryImport.model_validate(entry) for entry in document["entries"]],
    )


@router.get(
    "/evaluation-sets/{set_id}/entries/{entry_id}/input-text",
    response_model=EvaluationSetEntryInputTextResponse,
)
async def get_evaluation_set_entry_input_text(
    set_id: str, entry_id: str
) -> EvaluationSetEntryInputTextResponse:
    entry = await find_evaluation_set_entry(set_id, entry_id)

    if entry is None:
        raise HTTPException(status_code=404, detail="Evaluation set entry not found")

    return EvaluationSetEntryInputTextResponse(
        entry_id=entry_id,
        input_text=entry["input_text"],
    )


@router.get(
    "/evaluation-sets/{set_id}/golden-metrics",
    response_model=GoldenMetricsPassResponse,
)
async def get_golden_metrics_pass(set_id: str) -> GoldenMetricsPassResponse:
    """Progress only — no metric values, so this is cheap to poll."""
    documents = (
        await get_evaluation_sets_collection()
        .aggregate(
            [
                {"$match": {"_id": ObjectId(set_id)}},
                {
                    "$project": {
                        "golden_metrics_pass": 1,
                        "entry_count": {"$size": "$entries"},
                        "entries_with_metrics": _ENTRIES_WITH_METRICS_EXPR,
                    }
                },
            ]
        )
        .to_list(length=1)
    )
    if not documents:
        raise HTTPException(status_code=404, detail="Evaluation set not found")

    document = documents[0]
    golden_metrics_pass = document.get("golden_metrics_pass")
    return GoldenMetricsPassResponse(
        status=_golden_metrics_status(document),
        entry_count=document["entry_count"],
        entries_with_metrics=document["entries_with_metrics"],
        started_at=golden_metrics_pass["started_at"] if golden_metrics_pass else None,
        finished_at=golden_metrics_pass["finished_at"] if golden_metrics_pass else None,
        error=golden_metrics_pass["error"] if golden_metrics_pass else None,
    )


@router.post(
    "/evaluation-sets/{set_id}/golden-metrics",
    response_model=GoldenMetricsPassQueuedResponse,
    dependencies=[Depends(require_auth)],
)
async def queue_golden_metrics_pass(
    set_id: str,
    background_tasks: BackgroundTasks,
) -> GoldenMetricsPassQueuedResponse:
    document = await find_evaluation_set_or_404(set_id, {"golden_metrics_pass": 1})
    golden_metrics_pass = document.get("golden_metrics_pass")

    if golden_metrics_pass and golden_metrics_pass["status"] == "completed":
        raise HTTPException(status_code=409, detail="Golden metrics already computed")
    if golden_metrics_pass and golden_metrics_pass["status"] == "skipped":
        raise HTTPException(status_code=409, detail="Golden metrics were skipped at import")
    if (
        golden_metrics_pass
        and golden_metrics_pass["status"] in {"pending", "running"}
        and golden_metrics_pass["heartbeat_at"] >= stale_work_cutoff()
    ):
        raise HTTPException(status_code=409, detail="Golden metrics pass is already running")

    await get_evaluation_sets_collection().update_one(
        {"_id": ObjectId(set_id)},
        {
            "$set": {
                "golden_metrics_pass.status": "pending",
                "golden_metrics_pass.heartbeat_at": datetime.now(UTC),
                "golden_metrics_pass.resume_attempts": 0,
                "golden_metrics_pass.error": None,
            }
        },
    )
    background_tasks.add_task(run_golden_metrics_pass, set_id)
    log.info("golden metrics pass queued", set_id=set_id)

    return GoldenMetricsPassQueuedResponse(status="queued", evaluation_set_id=set_id)


@router.delete(
    "/evaluation-sets/{set_id}",
    response_model=EvaluationSetDeletedResponse,
    dependencies=[Depends(require_auth)],
)
async def delete_evaluation_set(set_id: str) -> EvaluationSetDeletedResponse:
    sets = get_evaluation_sets_collection()
    runs = get_evaluation_runs_collection()

    result = await sets.delete_one({"_id": ObjectId(set_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Evaluation set not found")

    deleted_runs = await runs.delete_many({"evaluation_set_id": set_id})
    return EvaluationSetDeletedResponse(
        status="deleted",
        evaluation_set_id=set_id,
        deleted_runs=deleted_runs.deleted_count,
    )
