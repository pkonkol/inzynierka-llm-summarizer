from datetime import datetime, UTC
from uuid import uuid4

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pymongo import DESCENDING
from fastapi.responses import JSONResponse


from ..core.mongo import get_evaluation_sets_collection
from ..core.auth import require_auth
from ..schemas.research import (
    EvaluationSetCreateResponse,
    EvaluationSetDetailResponse,
    EvaluationSetEntryResponse,
    EvaluationSetImportRequest,
    EvaluationSetListItemResponse,
)
from ..services.evaluation_set_metrics import build_golden_metrics

router = APIRouter(prefix="/api/v1/research", tags=["research"])


@router.post("/evaluation-sets", response_model=EvaluationSetCreateResponse, dependencies=[Depends(require_auth)])
async def create_evaluation_set(
    payload: EvaluationSetImportRequest,
) -> EvaluationSetCreateResponse:
    collection = get_evaluation_sets_collection()
    created_at = datetime.now(UTC)

    entries = [
        {
            "entry_id": str(uuid4()),
            "input_text": entry.input_text,
            "golden_summary": entry.golden_summary,
            "source_meta": entry.source_meta,
            "golden_metrics": (
                entry.golden_metrics.model_dump() if entry.golden_metrics else None
            ),
        }
        for entry in payload.entries
    ]

    document = {
        "name": payload.name,
        "language": payload.language,
        "created_at": created_at,
        "entries": entries,
    }

    result = await collection.insert_one(document)

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

    documents = (
        await collection.find(
            {},
            {
                "name": 1,
                "language": 1,
                "created_at": 1,
                "entries.entry_id": 1,
            },
        )
        .sort("created_at", DESCENDING)
        .to_list(length=1000)
    )

    return [
        EvaluationSetListItemResponse(
            evaluation_set_id=str(doc["_id"]),
            name=doc["name"],
            language=doc["language"],
            entry_count=len(doc["entries"]),
            created_at=doc["created_at"],
        )
        for doc in documents
    ]


@router.get("/evaluation-sets/{set_id}", response_model=EvaluationSetDetailResponse)
async def get_evaluation_set(set_id: str) -> EvaluationSetDetailResponse:
    collection = get_evaluation_sets_collection()
    document = await collection.find_one({"_id": ObjectId(set_id)})

    if document is None:
        raise HTTPException(status_code=404, detail="Evaluation set not found")

    return EvaluationSetDetailResponse(
        evaluation_set_id=str(document["_id"]),
        name=document["name"],
        language=document["language"],
        created_at=document["created_at"],
        entries=[
            EvaluationSetEntryResponse(
                entry_id=entry["entry_id"],
                golden_summary=entry["golden_summary"],
                source_meta=entry["source_meta"],
                golden_metrics=entry["golden_metrics"],
            )
            for entry in document["entries"]
        ],
    )

@router.get("/evaluation-sets/{set_id}/export")
async def export_evaluation_set(set_id: str) -> JSONResponse:
    collection = get_evaluation_sets_collection()
    document = await collection.find_one({"_id": ObjectId(set_id)})

    if document is None:
        raise HTTPException(status_code=404, detail="Evaluation set not found")

    payload = {
        "name": document["name"],
        "language": document["language"],
        "entries": [
            {
                "input_text": entry["input_text"],
                "golden_summary": entry["golden_summary"],
                "source_meta": entry.get("source_meta", {}),
                "golden_metrics": entry.get("golden_metrics"),
            }
            for entry in document["entries"]
        ],
    }

    return JSONResponse(content=payload)

@router.post("/evaluation-sets/{set_id}/golden-metrics", dependencies=[Depends(require_auth)])
async def evaluate_missing_golden_metrics(set_id: str) -> dict[str, int | str]:
    collection = get_evaluation_sets_collection()
    document = await collection.find_one({"_id": ObjectId(set_id)})

    if document is None:
        raise HTTPException(status_code=404, detail="Evaluation set not found")

    entries = document["entries"]
    updated_count = 0

    for entry in entries:
        if entry.get("golden_metrics") is not None:
            continue

        entry["golden_metrics"] = await build_golden_metrics(
            input_text=entry["input_text"],
            golden_summary=entry["golden_summary"],
        )
        updated_count += 1

    await collection.update_one(
        {"_id": document["_id"]},
        {"$set": {"entries": entries}},
    )

    return {
        "status": "ok",
        "updated_entries": updated_count,
        "total_entries": len(entries),
    }