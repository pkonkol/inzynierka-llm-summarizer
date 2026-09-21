"""One-off: bring pre-SummarySpec documents up to the current schema, then delete this file.

JobStatusResponse and EvaluationRunListItemResponse require processing_strategy, summary_spec
and language with no defaults, so a document written before those fields existed fails
validation on read. For jobs that is a 500 on GET /jobs/{id} and /jobs/by-url; for runs it is
worse, because the list endpoint validates every run in one pass and a single old document
takes the whole listing down.

Old fields (summary_mode, skip_takeaways) are left in place on purpose: these are thesis
research records and "what actually ran" is worth more than a clean schema.

Usage, from backend/:
    uv run --no-project scripts/backfill_job_language.py --dry-run
    ./venv/bin/python scripts/backfill_job_language.py --dry-run
Drop --dry-run to write. Reads MONGODB_URI/MONGODB_DB_NAME from backend/.env or the shell.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import structlog
from motor.motor_asyncio import AsyncIOMotorCollection

from app.core.config import settings
from app.core.mongo import (
    close_mongo,
    get_evaluation_runs_collection,
    get_jobs_collection,
    init_mongo,
)
from app.schemas.summary_spec import SummarySpec

log = structlog.get_logger(__name__)

# summary_simple was one call; summary_sequential and summary_cascade both extracted first.
_STRATEGY_BY_MODE = {
    "simple": "direct",
    "sequential": "extract_then_synthesize",
    "cascade": "extract_then_synthesize",
}
_DEFAULT_STRATEGY = "direct"
_DEFAULT_LANGUAGE = "en"

_NEEDS_BACKFILL = {
    "$or": [
        {"processing_strategy": {"$exists": False}},
        {"summary_spec": {"$exists": False}},
        {"language": {"$exists": False}},
    ]
}


def _missing_fields(document: dict) -> dict:
    fields: dict = {}
    if "processing_strategy" not in document:
        mode = document.get("summary_mode")
        fields["processing_strategy"] = _STRATEGY_BY_MODE.get(mode, _DEFAULT_STRATEGY)
    if "summary_spec" not in document:
        fields["summary_spec"] = SummarySpec().model_dump()
    if "language" not in document:
        fields["language"] = _DEFAULT_LANGUAGE
    return fields


async def _backfill(collection: AsyncIOMotorCollection, label: str, *, dry_run: bool) -> int:
    touched = 0
    async for document in collection.find(_NEEDS_BACKFILL):
        fields = _missing_fields(document)
        if not fields:
            continue
        touched += 1
        if dry_run:
            log.info(
                "would backfill", collection=label, _id=str(document["_id"]), fields=sorted(fields)
            )
            continue
        await collection.update_one({"_id": document["_id"]}, {"$set": fields})
    log.info(
        "dry run complete" if dry_run else "backfill complete",
        collection=label,
        documents=touched,
    )
    return touched


async def main(*, dry_run: bool) -> None:
    await init_mongo()
    try:
        log.info("connected", db=settings.mongodb_db_name)
        jobs = await _backfill(get_jobs_collection(), "jobs", dry_run=dry_run)
        runs = await _backfill(get_evaluation_runs_collection(), "evaluation_runs", dry_run=dry_run)
        log.info("total", documents=jobs + runs, dry_run=dry_run)
    finally:
        await close_mongo()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill legacy job and evaluation run documents")
    parser.add_argument("--dry-run", action="store_true", help="Report only, write nothing")
    asyncio.run(main(dry_run=parser.parse_args().dry_run))
