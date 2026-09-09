"""Tracks background tasks running inside this process.

Cloud Run reclaims an instance that has no request in flight, which would kill the
summarisation and evaluation tasks that run after their response was already sent.
`/api/v1/meta/keepalive` holds a connection open against that, and this module is what tells
it when to let go. The question there is whether *this* instance still has work, so it is
answered from memory rather than from the database.
"""

import asyncio
from collections.abc import AsyncIterator, Coroutine
from contextlib import asynccontextmanager, suppress
from typing import Any

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


async def wait_until_no_work_remaining(timeout_seconds: float) -> int:
    """Returns the moment this instance runs out of work, or when the window closes.

    The value is how much work is still tracked, so a caller knows whether to wait again.
    """
    with suppress(TimeoutError):
        await asyncio.wait_for(_no_work_remaining.wait(), timeout=timeout_seconds)
    return _active_work_count


# asyncio keeps only a weak reference to a running task, so a fire-and-forget task can be
# collected mid-flight and stop silently. Holding it here until it finishes is what prevents that.
_spawned_tasks: set[asyncio.Task] = set()


def spawn_tracked_task(coroutine: Coroutine[Any, Any, None], *, kind: str) -> None:
    """Fire-and-forget for work with no request to hang off, such as a resume at startup."""
    task = asyncio.create_task(coroutine)
    _spawned_tasks.add(task)

    def _forget(finished: asyncio.Task) -> None:
        _spawned_tasks.discard(finished)
        if not finished.cancelled() and (exc := finished.exception()) is not None:
            log.error("spawned task failed", kind=kind, exc_info=exc)

    task.add_done_callback(_forget)
