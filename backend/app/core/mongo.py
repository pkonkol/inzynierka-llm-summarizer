# backend/app/core/mongo.py
from datetime import datetime, timedelta, timezone

from pymongo import MongoClient
from pymongo.collection import Collection
from contextlib import asynccontextmanager
from .config import settings

_mongo_client: MongoClient | None = None

def init_mongo() -> None:
    """Inicjalizuj klient MongoDB z prawidłowymi settings dla Cloud Run"""
    global _mongo_client

    # retryWrites=True + serverSelectionTimeoutMS dla Cloud Run
    _mongo_client = MongoClient(
        settings.mongodb_uri,
        # Kluczowe dla stabilności w Cloud Run:
        retryWrites=False,
        retryReads=True,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=10000,
        # Nie zostawiaj None! Ustaw sensowny timeout dla LLM/Scrapera
        socketTimeoutMS=30000,
        # Automatyczne czyszczenie starych połączeń po uśpieniu kontenera
        maxIdleTimeMS=50000,
        maxPoolSize=10
    )

    # Test connection
    _mongo_client.admin.command('ping')

    ensure_indexes(get_jobs_collection())
    count = cleanup_stale_pending_jobs(max_age_hours=2)
    print(f"MongoDB initialized. Cleaned up {count} stale pending jobs.")

def close_mongo() -> None:
    global _mongo_client
    if _mongo_client is not None:
        _mongo_client.close()
    _mongo_client = None

def get_mongo_client() -> MongoClient:
    """Get instance (best practice - zawsze nowy client per request)"""
    if _mongo_client is None:
        raise RuntimeError("MongoDB client not initialized")
    return _mongo_client

def get_jobs_collection() -> Collection:
    """Get collection (best practice)"""
    client = get_mongo_client()
    db = client[settings.mongodb_db_name]
    return db[settings.mongodb_jobs_collection]

def ensure_indexes(collection) -> None:
    collection.create_index("source_url")
    collection.create_index([("created_at", -1)])


def cleanup_stale_pending_jobs(max_age_hours: int = 24) -> int:
    """
    Mark pending jobs older than max_age_hours as failed.
    Call once at startup to handle jobs killed mid-execution.
    """
    jobs_collection = get_jobs_collection()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    result = jobs_collection.update_many(
        {"status": "pending", "created_at": {"$lt": cutoff}},
        {"$set": {
            "status": "failed",
            "error": "Job killed before completion (server restart)",
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    return result.modified_count