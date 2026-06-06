# backend/app/core/mongo.py
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
        retryWrites=False,  # Wróć do True dla retry na błędy tymczasowe
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=10000,
        socketTimeoutMS=None,  # Bez timeout dla long operations
        # retryConnectionErrors=True,  # Cloud Run wymaga tego
        maxPoolSize=1,  # KLUCZOWE dla Cloud Run - no pooling!
    )

    # Test connection
    _mongo_client.admin.command('ping')

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