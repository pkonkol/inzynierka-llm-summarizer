"""One-off: fold key_takeaways into a markdown summary and stamp origin, then delete this file.

Run it BEFORE deploying the code that reads `summary_data.summary` as a required string. A
job or run entry produced in bullets mode carried its output in `key_takeaways` and left
`summary` null, so the new code would fail to validate it on read.

- jobs: `summary_data.summary` becomes the takeaways as a markdown list ("- a\\n- b", the exact
  text the metrics already judged); a job without `origin` gets "admin".
- evaluation_runs: the same for every entry's `ai_summary` / `ai_key_takeaways`.

The old fields (`key_takeaways`, `ai_key_takeaways`, `metrics.key_takeaways`) stay in place:
these are thesis research records and "what actually ran" is worth more than a clean schema.
Take a copy of both collections first; the write itself is not reversible.

Usage, from backend/:
    ./venv/bin/python scripts/backfill_summary_markdown.py --dry-run
Drop --dry-run to write. Reads MONGODB_URI/MONGODB_DB_NAME from backend/.env or the shell.
"""

import argparse
import asyncio
import sys
from collections.abc import Callable
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

log = structlog.get_logger(__name__)

# {"field": None} matches both a null and an absent field.
_JOB_NEEDS_SUMMARY = {
    "summary_data.key_takeaways": {"$type": "array"},
    "summary_data.summary": None,
}
_JOBS_NEED_BACKFILL = {"$or": [{"origin": {"$exists": False}}, _JOB_NEEDS_SUMMARY]}
_RUN_ENTRY_NEEDS_SUMMARY = {"ai_key_takeaways": {"$type": "array"}, "ai_summary": None}
_RUNS_NEED_BACKFILL = {"entries": {"$elemMatch": _RUN_ENTRY_NEEDS_SUMMARY}}


def _markdown_list(takeaways: list[str]) -> str:
    return "\n".join(f"- {item}" for item in takeaways)


def _job_fields(document: dict) -> dict:
    fields: dict = {}
    if "origin" not in document:
        fields["origin"] = "admin"
    summary_data = document.get("summary_data")
    if (
        summary_data is not None
        and summary_data.get("summary") is None
        and isinstance(summary_data.get("key_takeaways"), list)
    ):
        fields["summary_data.summary"] = _markdown_list(summary_data["key_takeaways"])
    return fields


def _run_fields(document: dict) -> dict:
    fields: dict = {}
    for index, entry in enumerate(document["entries"]):
        if entry.get("ai_summary") is None and isinstance(entry.get("ai_key_takeaways"), list):
            fields[f"entries.{index}.ai_summary"] = _markdown_list(entry["ai_key_takeaways"])
    return fields


async def _backfill(
    collection: AsyncIOMotorCollection,
    label: str,
    query: dict,
    build_fields: Callable[[dict], dict],
    *,
    dry_run: bool,
) -> int:
    touched = 0
    async for document in collection.find(query):
        fields = build_fields(document)
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
        "dry run complete" if dry_run else "backfill complete", collection=label, documents=touched
    )
    return touched


async def main(*, dry_run: bool) -> None:
    await init_mongo()
    try:
        log.info("connected", db=settings.mongodb_db_name)
        jobs = await _backfill(
            get_jobs_collection(), "jobs", _JOBS_NEED_BACKFILL, _job_fields, dry_run=dry_run
        )
        runs = await _backfill(
            get_evaluation_runs_collection(),
            "evaluation_runs",
            _RUNS_NEED_BACKFILL,
            _run_fields,
            dry_run=dry_run,
        )
        log.info("total", documents=jobs + runs, dry_run=dry_run)
    finally:
        await close_mongo()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fold key_takeaways into a markdown summary")
    parser.add_argument("--dry-run", action="store_true", help="Report only, write nothing")
    asyncio.run(main(dry_run=parser.parse_args().dry_run))
