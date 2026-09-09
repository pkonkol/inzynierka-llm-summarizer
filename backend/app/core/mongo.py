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
        tz_aware=True,
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

    log.info("mongodb initialised")


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
    await collection.create_index([("status", 1), ("heartbeat_at", 1)])
    await collection.create_index("source_url")
    await collection.create_index([("created_at", -1)])
    await collection.create_index([("updated_at", -1)])


async def ensure_evaluation_sets_indexes(collection: AsyncIOMotorCollection) -> None:
    await collection.create_index("name")
    await collection.create_index([("created_at", -1)])


async def ensure_evaluation_runs_indexes(collection: AsyncIOMotorCollection) -> None:
    await collection.create_index("evaluation_set_id")
    await collection.create_index([("status", 1), ("heartbeat_at", 1)])
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


def stale_work_cutoff() -> datetime:
    """Work whose heartbeat is older than this is treated as belonging to a dead process.

    The bound being cleared is the longest gap between two heartbeats, which is the time one
    entry takes, so this is sized against a slow entry rather than against a whole run. Erring
    long is deliberate: killing a live run costs the whole run, while leaving a dead one costs
    the delay before it is reported.
    """
    return datetime.now(UTC) - timedelta(minutes=settings.stale_work_timeout_minutes)


# MIGRATION: until 2026-03, documents created before heartbeats existed have no heartbeat_at.
# Range operators in MongoDB are type-bracketed, so the query above cannot see them and they
# would hang forever. Delete this once no such documents remain.
_MISSING_HEARTBEAT = {"heartbeat_at": {"$exists": False}}


async def cleanup_stale_pending_jobs() -> int:
    jobs_collection = get_jobs_collection()
    unfinished = {"status": {"$in": ["pending", "running"]}}
    update = {
        "$set": {
            "status": "failed",
            "error": "Job killed before completion (server restart)",
            "updated_at": datetime.now(UTC),
        }
    }
    result = await jobs_collection.update_many(
        {**unfinished, "heartbeat_at": {"$lt": stale_work_cutoff()}}, update
    )
    legacy = await jobs_collection.update_many({**unfinished, **_MISSING_HEARTBEAT}, update)
    return result.modified_count + legacy.modified_count


async def cleanup_stale_evaluation_runs() -> int:
    runs_collection = get_evaluation_runs_collection()
    unfinished = {"status": {"$in": ["pending", "running"]}}
    update = {
        "$set": {
            "status": "failed",
            "finished_at": datetime.now(UTC),
            "aggregate_metrics.error": "Evaluation run stopped responding and could not be resumed",
        }
    }
    result = await runs_collection.update_many(
        {**unfinished, "heartbeat_at": {"$lt": stale_work_cutoff()}}, update
    )
    legacy = await runs_collection.update_many({**unfinished, **_MISSING_HEARTBEAT}, update)
    return result.modified_count + legacy.modified_count
