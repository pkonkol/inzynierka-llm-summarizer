# routers/evaluation_sets.py — /api/v1/research routes for evaluation sets

from datetime import UTC, datetime
from uuid import uuid4

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pymongo import DESCENDING

from ..core.auth import require_auth
from ..core.mongo import (
    find_evaluation_set_entry,
    get_evaluation_runs_collection,
    get_evaluation_sets_collection,
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
    GoldenMetricsBackfillResponse,
)
from ..schemas.evaluation_set_db import EvaluationSetDocument, EvaluationSetEntryDocument
from ..services.evaluation_set_metrics import build_golden_metrics

router = APIRouter(prefix="/api/v1/research", tags=["research"])


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

    document = EvaluationSetDocument(
        name=payload.name,
        language=payload.language,
        created_at=created_at,
        entries=entries,
    )

    result = await collection.insert_one(document.model_dump())

    return EvaluationSetCreateResponse(
        evaluation_set_id=str(result.inserted_id),
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
                    "entry_count": {"$size": "$entries"},
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


@router.post(
    "/evaluation-sets/{set_id}/golden-metrics",
    response_model=GoldenMetricsBackfillResponse,
    dependencies=[Depends(require_auth)],
)
async def evaluate_missing_golden_metrics(set_id: str) -> GoldenMetricsBackfillResponse:
    document = await find_evaluation_set_or_404(set_id)
    entries = document["entries"]
    updated_count = 0

    for entry in entries:
        golden_metrics = entry.get("golden_metrics")
        if golden_metrics is not None and "char_count" in golden_metrics.get("source", {}):
            continue

        entry["golden_metrics"] = await build_golden_metrics(
            input_text=entry["input_text"],
            golden_summary=entry["golden_summary"],
        )
        updated_count += 1

    await get_evaluation_sets_collection().update_one(
        {"_id": document["_id"]},
        {"$set": {"entries": entries}},
    )

    return GoldenMetricsBackfillResponse(
        status="ok",
        updated_entries=updated_count,
        total_entries=len(entries),
    )


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
