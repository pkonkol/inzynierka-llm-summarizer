from datetime import UTC, datetime, timedelta

import structlog
from bson import ObjectId
from motor.motor_asyncio import (
    AsyncIOMotorClient,
    AsyncIOMotorCollection,
    AsyncIOMotorDatabase,
)

from .config import settings

log = structlog.get_logger(__name__)

_mongo_client: AsyncIOMotorClient | None = None


async def init_mongo() -> None:
    global _mongo_client

    _mongo_client = AsyncIOMotorClient(
        settings.mongodb_uri,
        retryWrites=False,
        retryReads=True,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=10000,
        socketTimeoutMS=30000,
        maxIdleTimeMS=50000,
        maxPoolSize=10,
    )

    await _mongo_client.admin.command("ping")

    jobs_collection = get_jobs_collection()
    evaluation_sets_collection = get_evaluation_sets_collection()
    evaluation_runs_collection = get_evaluation_runs_collection()

    await ensure_jobs_indexes(jobs_collection)
    await ensure_evaluation_sets_indexes(evaluation_sets_collection)
    await ensure_evaluation_runs_indexes(evaluation_runs_collection)

    count = await cleanup_stale_pending_jobs(max_age_hours=2)
    run_count = await cleanup_stale_evaluation_runs(max_age_hours=2)
    log.info(
        "mongodb initialised",
        stale_jobs_cleaned=count,
        stale_runs_cleaned=run_count,
    )


async def close_mongo() -> None:
    global _mongo_client
    if _mongo_client is not None:
        _mongo_client.close()
    _mongo_client = None


def get_mongo_client() -> AsyncIOMotorClient:
    if _mongo_client is None:
        raise RuntimeError("MongoDB client not initialized")
    return _mongo_client


def get_database() -> AsyncIOMotorDatabase:
    client = get_mongo_client()
    return client[settings.mongodb_db_name]


def get_jobs_collection() -> AsyncIOMotorCollection:
    return get_database()[settings.mongodb_jobs_collection]


def get_evaluation_sets_collection() -> AsyncIOMotorCollection:
    return get_database()["evaluation_sets"]


def get_evaluation_runs_collection() -> AsyncIOMotorCollection:
    return get_database()["evaluation_runs"]


async def ensure_jobs_indexes(collection: AsyncIOMotorCollection) -> None:
    await collection.create_index("job_id", unique=True)
    await collection.create_index("source_url")
    await collection.create_index([("created_at", -1)])
    await collection.create_index([("updated_at", -1)])


async def ensure_evaluation_sets_indexes(collection: AsyncIOMotorCollection) -> None:
    await collection.create_index("name")
    await collection.create_index([("created_at", -1)])


async def ensure_evaluation_runs_indexes(collection: AsyncIOMotorCollection) -> None:
    await collection.create_index("evaluation_set_id")
    await collection.create_index([("created_at", -1)])


async def find_evaluation_set_entry(set_id: str, entry_id: str) -> dict | None:
    """One set entry per round-trip; the whole entries array carries every input_text."""
    document = await get_evaluation_sets_collection().find_one(
        {"_id": ObjectId(set_id), "entries.entry_id": entry_id},
        {"entries.$": 1},
    )
    if document is None or not document.get("entries"):
        return None
    return document["entries"][0]


async def cleanup_stale_pending_jobs(max_age_hours: int = 24) -> int:
    jobs_collection = get_jobs_collection()
    cutoff = datetime.now(UTC) - timedelta(hours=max_age_hours)
    result = await jobs_collection.update_many(
        {"status": "pending", "created_at": {"$lt": cutoff}},
        {
            "$set": {
                "status": "failed",
                "error": "Job killed before completion (server restart)",
                "updated_at": datetime.now(UTC),
            }
        },
    )
    return result.modified_count


async def cleanup_stale_evaluation_runs(max_age_hours: int = 2) -> int:
    runs_collection = get_evaluation_runs_collection()
    cutoff = datetime.now(UTC) - timedelta(hours=max_age_hours)
    result = await runs_collection.update_many(
        {"status": {"$in": ["pending", "running"]}, "created_at": {"$lt": cutoff}},
        {
            "$set": {
                "status": "failed",
                "finished_at": datetime.now(UTC),
                "aggregate_metrics.error": "Evaluation run killed before completion (server restart)",
            }
        },
    )
    return result.modified_count
