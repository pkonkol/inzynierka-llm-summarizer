import math
from datetime import UTC, datetime, timedelta

import structlog
from fastapi import HTTPException, Request

from .config import settings
from .mongo import get_rate_limits_collection

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


async def enforce_public_rate_limit(request: Request) -> None:
    """Sliding window per client IP. Count-then-insert is not atomic, so parallel requests from
    one IP can overshoot the limit by a few; the limit protects an LLM budget, not a quota."""
    key = client_ip(request)
    window = timedelta(minutes=settings.public_rate_limit_window_minutes)
    now = datetime.now(UTC)
    collection = get_rate_limits_collection()
    log.debug("checking public rate limit", client_ip=key)

    in_window = {"key": key, "at": {"$gte": now - window}}
    if await collection.count_documents(in_window) >= settings.public_rate_limit_requests:
        oldest = await collection.find_one(in_window, sort=[("at", 1)])
        # The oldest hit can expire between the count and this read; then a slot is already free.
        seconds_left = (oldest["at"] + window - now).total_seconds() if oldest else 0
        retry_after = max(1, math.ceil(seconds_left))
        log.info("public rate limit exceeded", client_ip=key, retry_after=retry_after)
        raise HTTPException(
            status_code=429,
            detail="Przekroczono limit podsumowań. Spróbuj ponownie później.",
            headers={"Retry-After": str(retry_after)},
        )

    await collection.insert_one({"key": key, "at": now})
