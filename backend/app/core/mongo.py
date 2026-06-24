from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection
from .config import settings

_mongo_client: AsyncIOMotorClient | None = None


async def init_mongo() -> None:
    """Initialize async Motor client and run startup tasks."""
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

    collection = get_jobs_collection()
    await ensure_indexes(collection)
    count = await cleanup_stale_pending_jobs(max_age_hours=2)
    print(f"MongoDB initialized. Cleaned up {count} stale pending jobs.")


async def close_mongo() -> None:
    global _mongo_client
    if _mongo_client is not None:
        _mongo_client.close()
    _mongo_client = None


def get_mongo_client() -> AsyncIOMotorClient:
    if _mongo_client is None:
        raise RuntimeError("MongoDB client not initialized")
    return _mongo_client


def get_jobs_collection() -> AsyncIOMotorCollection:
    client = get_mongo_client()
    db = client[settings.mongodb_db_name]
    return db[settings.mongodb_jobs_collection]


async def ensure_indexes(collection: AsyncIOMotorCollection) -> None:
    await collection.create_index("source_url")
    await collection.create_index([("created_at", -1)])


async def cleanup_stale_pending_jobs(max_age_hours: int = 24) -> int:
    """
    Mark pending jobs older than max_age_hours as failed.
    Called once at startup to handle jobs killed mid-execution.
    """
    jobs_collection = get_jobs_collection()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    result = await jobs_collection.update_many(
        {"status": "pending", "created_at": {"$lt": cutoff}},
        {"$set": {
            "status": "failed",
            "error": "Job killed before completion (server restart)",
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    return result.modified_count
