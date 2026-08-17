from datetime import UTC, datetime
from uuid import uuid4

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
)
from ..schemas.evaluation_run_db import EvaluationRunDocument, EvaluationRunEntryDocument
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
from ..services.evaluation_run_metrics import compute_run_deepeval_metrics
from ..services.evaluation_runner import run_evaluation_batch
from ..services.evaluation_set_metrics import build_golden_metrics

router = APIRouter(prefix="/api/v1/research", tags=["research"])


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
                title=entry["title"],
                url=entry["url"],
                golden_metrics=entry["golden_metrics"],
            )
            for entry in document["entries"]
        ],
    )


@router.get("/evaluation-sets/{set_id}/export", response_model=EvaluationSetExportResponse)
async def export_evaluation_set(set_id: str) -> EvaluationSetExportResponse:
    collection = get_evaluation_sets_collection()
    document = await collection.find_one({"_id": ObjectId(set_id)})

    if document is None:
        raise HTTPException(status_code=404, detail="Evaluation set not found")

    return EvaluationSetExportResponse(
        name=document["name"],
        language=document["language"],
        entries=[
            EvaluationSetEntryImport(
                input_text=entry["input_text"],
                golden_summary=entry["golden_summary"],
                title=entry["title"],
                url=entry["url"],
                golden_metrics=entry.get("golden_metrics"),
            )
            for entry in document["entries"]
        ],
    )


@router.get(
    "/evaluation-sets/{set_id}/entries/{entry_id}/input-text",
    response_model=EvaluationSetEntryInputTextResponse,
)
async def get_evaluation_set_entry_input_text(
    set_id: str, entry_id: str
) -> EvaluationSetEntryInputTextResponse:
    collection = get_evaluation_sets_collection()
    document = await collection.find_one(
        {"_id": ObjectId(set_id), "entries.entry_id": entry_id},
        {"entries.$": 1},
    )

    if document is None or not document.get("entries"):
        raise HTTPException(status_code=404, detail="Evaluation set entry not found")

    return EvaluationSetEntryInputTextResponse(
        entry_id=entry_id,
        input_text=document["entries"][0]["input_text"],
    )


@router.post(
    "/evaluation-sets/{set_id}/golden-metrics",
    response_model=GoldenMetricsBackfillResponse,
    dependencies=[Depends(require_auth)],
)
async def evaluate_missing_golden_metrics(set_id: str) -> GoldenMetricsBackfillResponse:
    collection = get_evaluation_sets_collection()
    document = await collection.find_one({"_id": ObjectId(set_id)})

    if document is None:
        raise HTTPException(status_code=404, detail="Evaluation set not found")

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

    await collection.update_one(
        {"_id": document["_id"]},
        {"$set": {"entries": entries}},
    )

    return GoldenMetricsBackfillResponse(
        status="ok",
        updated_entries=updated_count,
        total_entries=len(entries),
    )


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
    sets = get_evaluation_sets_collection()
    runs = get_evaluation_runs_collection()

    set_document = await sets.find_one({"_id": ObjectId(set_id)})
    if set_document is None:
        raise HTTPException(status_code=404, detail="Evaluation set not found")

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
        status="pending",
        created_at=created_at,
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
        EvaluationRunListItemResponse(
            evaluation_run_id=str(doc["_id"]),
            evaluation_set_id=doc["evaluation_set_id"],
            evaluation_set_name=doc["evaluation_set_name"],
            model_provider=doc["model_provider"],
            model_name=doc["model_name"],
            summary_mode=doc["summary_mode"],
            language=doc["language"],
            status=doc["status"],
            created_at=doc["created_at"],
            finished_at=doc.get("finished_at"),
            entry_count=doc["entry_count"],
        )
        for doc in documents
    ]


@router.get("/runs/{run_id}", response_model=EvaluationRunResponse)
async def get_evaluation_run(run_id: str) -> EvaluationRunResponse:
    runs = get_evaluation_runs_collection()
    document = await runs.find_one(
        {"_id": ObjectId(run_id)},
        {
            "evaluation_set_id": 1,
            "evaluation_set_name": 1,
            "model_provider": 1,
            "model_name": 1,
            "summary_mode": 1,
            "language": 1,
            "status": 1,
            "created_at": 1,
            "finished_at": 1,
            "entries.entry_id": 1,
            "aggregate_metrics": 1,
        },
    )

    if document is None:
        raise HTTPException(status_code=404, detail="Evaluation run not found")

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
        entry_count=len(document["entries"]),
        aggregate_metrics=document.get("aggregate_metrics", {}),
    )


@router.get("/runs/{run_id}/entries", response_model=EvaluationRunEntriesResponse)
async def get_evaluation_run_entries(run_id: str) -> EvaluationRunEntriesResponse:
    runs = get_evaluation_runs_collection()
    sets = get_evaluation_sets_collection()

    run_document = await runs.find_one(
        {"_id": ObjectId(run_id)},
        {"entries": 1, "evaluation_set_id": 1},
    )

    if run_document is None:
        raise HTTPException(status_code=404, detail="Evaluation run not found")

    set_document = await sets.find_one(
        {"_id": ObjectId(run_document["evaluation_set_id"])},
        {"entries.entry_id": 1, "entries.title": 1, "entries.url": 1, "entries.golden_metrics": 1},
    )
    if set_document is None:
        raise HTTPException(status_code=404, detail="Evaluation set not found")

    set_entries_by_id = {entry["entry_id"]: entry for entry in set_document["entries"]}

    entries = [
        EvaluationRunEntryResponse(
            entry_id=run_entry["entry_id"],
            title=set_entries_by_id[run_entry["entry_id"]]["title"],
            url=set_entries_by_id[run_entry["entry_id"]]["url"],
            golden_summary=run_entry["golden_summary"],
            golden_metrics=set_entries_by_id[run_entry["entry_id"]]["golden_metrics"],
            ai_summary=run_entry["ai_summary"],
            ai_key_takeaways=run_entry["ai_key_takeaways"],
            ai_metrics=run_entry["ai_metrics"],
            cross_metrics=run_entry["cross_metrics"],
            status=run_entry["status"],
            error=run_entry["error"],
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
    runs = get_evaluation_runs_collection()
    document = await runs.find_one({"_id": ObjectId(run_id)}, {"status": 1})

    if document is None:
        raise HTTPException(status_code=404, detail="Evaluation run not found")

    if document["status"] in {"pending", "running"}:
        raise HTTPException(
            status_code=409,
            detail="Evaluation run must be finished before running GEval",
        )

    background_tasks.add_task(compute_run_deepeval_metrics, run_id)

    return DeepevalQueuedResponse(status="queued", run_id=run_id)


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
