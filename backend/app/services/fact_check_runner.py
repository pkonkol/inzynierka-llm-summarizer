# services/fact_check_runner.py — the fact check a visitor starts under a completed summary

import asyncio
from datetime import UTC, datetime
from typing import Any

import structlog
from pymongo.asynchronous.collection import AsyncCollection

from ..core.background_work import spawn_tracked_task, track_background_work
from ..core.mongo import get_jobs_collection
from ..schemas.context_expansion import ContextExpansionResult, RelatedSource
from ..schemas.fact_check import AssessedSource, FactCheck, FactCheckSearch, LlmAssessmentRequest
from ..schemas.usage import UsageMetadata
from .context_expansion import expand_context, search_fact_checks
from .llm.assessment import generate_assessment

log = structlog.get_logger(__name__)

NO_SOURCES_TEXT = "Nie znaleziono źródeł do porównania."
FAILED_MESSAGE = "Nie udało się sprawdzić faktów. Spróbuj ponownie później."


class FactCheckNotAllowedError(RuntimeError):
    """The summary is not completed yet, or its fact check is already queued, running or done."""


async def start_fact_check(job_id: str) -> None:
    """Marks the job's fact check pending and runs it in the background; a failed one may be started again."""
    log.debug("starting fact check", job_id=job_id)
    requested_at = datetime.now(UTC)
    pending = FactCheck(
        status="pending",
        requested_at=requested_at,
        text=None,
        sources=[],
        context_expansion=None,
        fact_check_search=None,
        usage=None,
        duration_ms=None,
        error=None,
    )
    # One conditional write, so two clicks at once cannot both start a fact check.
    result = await get_jobs_collection().update_one(
        {
            "job_id": job_id,
            "status": "completed",
            "$or": [{"fact_check": None}, {"fact_check.status": "failed"}],
        },
        {"$set": {"fact_check": pending.model_dump(), "updated_at": requested_at}},
    )
    if result.modified_count == 0:
        raise FactCheckNotAllowedError(f"job {job_id} cannot start a fact check now")

    log.info("fact check requested", job_id=job_id)
    spawn_tracked_task(run_fact_check(job_id), kind="fact_check")


@track_background_work("fact_check")
async def run_fact_check(job_id: str) -> None:
    """Searches fact-checking sites and the web for the job's source, writes the assessment and stores it on the job."""
    jobs_collection = get_jobs_collection()
    job = await jobs_collection.find_one({"job_id": job_id})
    if job is None:
        raise ValueError(f"Job {job_id} not found")

    structlog.contextvars.bind_contextvars(job_id=job_id)
    started_at = datetime.now(UTC)
    try:
        await _set_fact_check_fields(jobs_collection, job_id, {"status": "running"})
        log.info("fact check started")
        fact_check = await _check_facts(job, started_at)
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


async def _check_facts(job: dict[str, Any], started_at: datetime) -> FactCheck:
    source_text = job["input_text"]  # the completed summary stored the full text its model read
    (fact_check_search, fact_check_sources), context_expansion = await asyncio.gather(
        search_fact_checks(
            source_text, job["source_url"], job["model_provider"], job["model_name"]
        ),
        _search_related_sources(job, source_text),
    )
    related_sources = _fact_checks_first(fact_check_sources, context_expansion.selected)
    requested_at = job["fact_check"]["requested_at"]
    if not related_sources:
        return _completed(
            NO_SOURCES_TEXT,
            [],
            requested_at,
            context_expansion,
            fact_check_search,
            UsageMetadata(),
            started_at,
        )

    assessment = await generate_assessment(
        LlmAssessmentRequest(
            text=source_text,
            source_url=job["source_url"],
            language=job["language"],
            model_provider=job["model_provider"],
            model_name=job["model_name"],
            target_words=job["resolved_length"]["target_words"],
            related_sources=related_sources,
        )
    )
    assessed_sources = [
        AssessedSource(**source.model_dump(), stance=stance)
        for source, stance in zip(related_sources, assessment.source_stances, strict=True)
    ]
    return _completed(
        assessment.text,
        assessed_sources,
        requested_at,
        context_expansion,
        fact_check_search,
        assessment.usage,
        started_at,
    )


def _fact_checks_first(
    fact_check_sources: list[RelatedSource], general_sources: list[RelatedSource]
) -> list[RelatedSource]:
    fact_check_urls = {source.url for source in fact_check_sources}
    return fact_check_sources + [
        source for source in general_sources if source.url not in fact_check_urls
    ]


async def _search_related_sources(job: dict[str, Any], source_text: str) -> ContextExpansionResult:
    """The web context toggle already ran the same staged search for the summary; paying for it twice buys nothing."""
    if job["context_expansion_mode"] == "staged":
        return ContextExpansionResult.model_validate(job["context_expansion"])
    return await expand_context(
        source_text, job["source_url"], "staged", job["model_provider"], job["model_name"]
    )


def _completed(
    text: str,
    sources: list[AssessedSource],
    requested_at: datetime,
    context_expansion: ContextExpansionResult,
    fact_check_search: FactCheckSearch,
    usage: UsageMetadata,
    started_at: datetime,
) -> FactCheck:
    return FactCheck(
        status="completed",
        requested_at=requested_at,
        text=text,
        sources=sources,
        context_expansion=context_expansion,
        fact_check_search=fact_check_search,
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
