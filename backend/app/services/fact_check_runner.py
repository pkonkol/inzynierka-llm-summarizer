# services/fact_check_runner.py — the background fact check started after a job's summary completes

from datetime import UTC, datetime
from typing import Any

import structlog
from pymongo.asynchronous.collection import AsyncCollection

from ..core.background_work import spawn_tracked_task, track_background_work
from ..core.mongo import get_jobs_collection
from ..schemas.context_expansion import ContextExpansionResult
from ..schemas.fact_check import FactCheck, LlmAssessmentRequest
from ..schemas.usage import UsageMetadata
from .context_expansion import expand_context
from .llm.assessment import generate_assessment

log = structlog.get_logger(__name__)

NO_SOURCES_TEXT = "Nie znaleziono źródeł do porównania."
FAILED_MESSAGE = "Nie udało się sprawdzić faktów. Spróbuj ponownie później."


@track_background_work("fact_check")
async def run_fact_check(job_id: str, source_text: str) -> None:
    """Searches the web for the job's source, writes the assessment and stores it on the job; never touches the summary."""
    jobs_collection = get_jobs_collection()
    job = await jobs_collection.find_one({"job_id": job_id})
    if job is None:
        raise ValueError(f"Job {job_id} not found")

    structlog.contextvars.bind_contextvars(job_id=job_id)
    started_at = datetime.now(UTC)
    try:
        await _set_fact_check_fields(jobs_collection, job_id, {"status": "running"})
        log.info("fact check started")
        fact_check = await _check_facts(job, source_text, started_at)
        # A fact check that startup cleanup already failed stays failed: clients stopped polling it.
        await jobs_collection.update_one(
            {"job_id": job_id, "fact_check.status": "running"},
            {"$set": {"fact_check": fact_check.model_dump(), "updated_at": datetime.now(UTC)}},
        )
        log.info(
            "fact check completed",
            source_count=len(fact_check.sources),
            duration_ms=fact_check.duration_ms,
        )
    except Exception as exc:
        log.exception("fact check failed", error_type=type(exc).__name__)
        await _set_fact_check_fields(
            jobs_collection, job_id, {"status": "failed", "error": FAILED_MESSAGE}
        )
    finally:
        structlog.contextvars.unbind_contextvars("job_id")


def spawn_fact_check(job_id: str, source_text: str) -> None:
    spawn_tracked_task(run_fact_check(job_id, source_text), kind="fact_check")


async def _check_facts(job: dict[str, Any], source_text: str, started_at: datetime) -> FactCheck:
    context_expansion = await _search_related_sources(job, source_text)
    if not context_expansion.selected:
        return _completed(NO_SOURCES_TEXT, context_expansion, UsageMetadata(), started_at)

    assessment = await generate_assessment(
        LlmAssessmentRequest(
            text=source_text,
            source_url=job["source_url"],
            language=job["language"],
            model_provider=job["model_provider"],
            model_name=job["model_name"],
            target_words=job["resolved_length"]["target_words"],
            related_sources=context_expansion.selected,
        )
    )
    return _completed(assessment.text, context_expansion, assessment.usage, started_at)


async def _search_related_sources(job: dict[str, Any], source_text: str) -> ContextExpansionResult:
    """The web context toggle already ran the same staged search for the summary; paying for it twice buys nothing."""
    if job["context_expansion_mode"] == "staged":
        return ContextExpansionResult.model_validate(job["context_expansion"])
    return await expand_context(
        source_text, job["source_url"], "staged", job["model_provider"], job["model_name"]
    )


def _completed(
    text: str,
    context_expansion: ContextExpansionResult,
    usage: UsageMetadata,
    started_at: datetime,
) -> FactCheck:
    return FactCheck(
        status="completed",
        text=text,
        sources=context_expansion.selected,
        context_expansion=context_expansion,
        usage=usage,
        duration_ms=int((datetime.now(UTC) - started_at).total_seconds() * 1000),
        error=None,
    )


async def _set_fact_check_fields(
    jobs_collection: AsyncCollection, job_id: str, fields: dict[str, Any]
) -> None:
    await jobs_collection.update_one(
        {"job_id": job_id},
        {
            "$set": {
                **{f"fact_check.{name}": value for name, value in fields.items()},
                "updated_at": datetime.now(UTC),
            }
        },
    )
