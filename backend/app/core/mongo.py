from pymongo import MongoClient
from pymongo.collection import Collection

from .config import settings

_mongo_client: MongoClient | None = None
_jobs_collection: Collection | None = None


def init_mongo() -> None:
    global _mongo_client, _jobs_collection

    client = MongoClient(settings.mongodb_uri)
    db = client[settings.mongodb_db_name]
    jobs_collection = db[settings.mongodb_jobs_collection]
    jobs_collection.create_index("job_id", unique=True)

    _mongo_client = client
    _jobs_collection = jobs_collection


def close_mongo() -> None:
    global _mongo_client, _jobs_collection

    if _mongo_client is not None:
        _mongo_client.close()

    _mongo_client = None
    _jobs_collection = None


def get_jobs_collection() -> Collection:
    if _jobs_collection is None:
        raise RuntimeError("MongoDB collection is not initialized")

    return _jobs_collection
