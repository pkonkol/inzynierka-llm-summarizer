"""Tracks background tasks running inside this process.

Cloud Run reclaims an instance that has no request in flight, which would kill the
summarisation and evaluation tasks that run after their response was already sent.
`/api/v1/meta/keepalive` holds a connection open against that, and this module is what tells
it when to let go. The question there is whether *this* instance still has work, so it is
answered from memory rather than from the database.
"""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

import structlog

log = structlog.get_logger(__name__)

_active_work_count = 0
_no_work_remaining = asyncio.Event()
_no_work_remaining.set()


@asynccontextmanager
async def track_background_work(kind: str) -> AsyncIterator[None]:
    global _active_work_count
    _active_work_count += 1
    _no_work_remaining.clear()
    log.debug("background work started", kind=kind, active_work=_active_work_count)
    try:
        yield
    finally:
        _active_work_count -= 1
        if _active_work_count == 0:
            _no_work_remaining.set()
        log.debug("background work finished", kind=kind, active_work=_active_work_count)


def active_work_count() -> int:
    return _active_work_count


async def wait_until_no_work_remaining(timeout_seconds: float) -> None:
    """Returns the moment this instance runs out of work, or when the window closes."""
    with suppress(TimeoutError):
        await asyncio.wait_for(_no_work_remaining.wait(), timeout=timeout_seconds)
