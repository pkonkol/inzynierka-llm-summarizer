from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import (
    AsyncIOMotorClient,
    AsyncIOMotorCollection,
    AsyncIOMotorDatabase,
)

from .config import settings

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
    await collection.create_index("source_url")
    await collection.create_index([("created_at", -1)])


async def ensure_evaluation_sets_indexes(collection: AsyncIOMotorCollection) -> None:
    await collection.create_index("name")
    await collection.create_index([("created_at", -1)])


async def ensure_evaluation_runs_indexes(collection: AsyncIOMotorCollection) -> None:
    await collection.create_index("evaluation_set_id")
    await collection.create_index([("created_at", -1)])


async def cleanup_stale_pending_jobs(max_age_hours: int = 24) -> int:
    jobs_collection = get_jobs_collection()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    result = await jobs_collection.update_many(
        {"status": "pending", "created_at": {"$lt": cutoff}},
        {
            "$set": {
                "status": "failed",
                "error": "Job killed before completion (server restart)",
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    return result.modified_count