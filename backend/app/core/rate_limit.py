import math
from datetime import UTC, datetime, timedelta
from typing import Literal

import structlog
from fastapi import HTTPException, Request

from .config import settings
from .mongo import get_jobs_collection, get_rate_limits_collection

log = structlog.get_logger(__name__)


def client_ip(request: Request) -> str:
    """The rightmost X-Forwarded-For entry is the one Google's front end appends; everything
    left of it is client-supplied and free to forge, so trusting the first entry would let a
    caller pick a fresh identity per request."""
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[-1].strip()
    if request.client is None:
        raise RuntimeError("request has neither X-Forwarded-For nor a client address")
    return request.client.host


RateLimitScope = Literal["summarize", "fact_check"]


async def enforce_public_rate_limit(request: Request, scope: RateLimitScope) -> None:
    """Sliding window per client IP, counted separately for each scope, so a reader's summaries
    do not use up the fact checks under them. Count-then-insert is not atomic, so parallel
    requests from one IP can overshoot the limit by a few; the limit protects an LLM budget,
    not a quota."""
    key = f"{scope}:{client_ip(request)}"
    window = timedelta(minutes=settings.public_rate_limit_window_minutes)
    now = datetime.now(UTC)
    collection = get_rate_limits_collection()
    log.debug("checking public rate limit", key=key)

    in_window = {"key": key, "at": {"$gte": now - window}}
    if await collection.count_documents(in_window) >= settings.public_rate_limit_requests:
        oldest = await collection.find_one(in_window, sort=[("at", 1)])
        # The oldest hit can expire between the count and this read; then a slot is already free.
        seconds_left = (oldest["at"] + window - now).total_seconds() if oldest else 0
        retry_after = max(1, math.ceil(seconds_left))
        log.info("public rate limit exceeded", key=key, retry_after=retry_after)
        raise HTTPException(
            status_code=429,
            detail="Przekroczono limit podsumowań. Spróbuj ponownie później.",
            headers={"Retry-After": str(retry_after)},
        )

    await collection.insert_one({"key": key, "at": now})


_WEB_SEARCH_WINDOW = timedelta(hours=24)


async def _oldest_search_in_window(since: datetime) -> datetime | None:
    jobs_collection = get_jobs_collection()
    oldest_staged = await jobs_collection.find_one(
        _staged_jobs_since(since), sort=[("created_at", 1)]
    )
    oldest_fact_check = await jobs_collection.find_one(
        _fact_checks_since(since), sort=[("fact_check.requested_at", 1)]
    )
    search_times = []
    if oldest_staged is not None:
        search_times.append(oldest_staged["created_at"])
    if oldest_fact_check is not None:
        search_times.append(oldest_fact_check["fact_check"]["requested_at"])
    return min(search_times) if search_times else None


def _staged_jobs_since(since: datetime) -> dict:
    return {"origin": "public", "context_expansion_mode": "staged", "created_at": {"$gte": since}}


def _fact_checks_since(since: datetime) -> dict:
    return {"origin": "public", "fact_check.requested_at": {"$gte": since}}


async def enforce_public_web_search_limit() -> None:
    """One budget for every visitor together, since a per-IP limit does not stop a pool of addresses.
    Each staged summary and each fact check spends one search, counted from the jobs themselves by
    when it was asked for; like the per-IP limit, parallel requests can overshoot by a few."""
    now = datetime.now(UTC)
    since = now - _WEB_SEARCH_WINDOW
    jobs_collection = get_jobs_collection()
    used = await jobs_collection.count_documents(
        _staged_jobs_since(since)
    ) + await jobs_collection.count_documents(_fact_checks_since(since))
    log.debug("checking public web search limit", used=used)
    if used < settings.public_context_expansion_daily_limit:
        return

    oldest = await _oldest_search_in_window(since)
    # The oldest search can leave the window between the count and this read; then a slot is already free.
    seconds_left = (oldest + _WEB_SEARCH_WINDOW - now).total_seconds() if oldest else 0
    retry_after = max(1, math.ceil(seconds_left))
    log.info("public web search limit exceeded", used=used, retry_after=retry_after)
    raise HTTPException(
        status_code=429,
        detail="Wyczerpano dzienny limit podsumowań z wyszukiwaniem w sieci (kontekst z sieci, sprawdzanie faktów). Spróbuj bez tych opcji albo jutro.",
        headers={"Retry-After": str(retry_after)},
    )
