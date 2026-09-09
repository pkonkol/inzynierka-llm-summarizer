from __future__ import annotations

import asyncio
from collections.abc import Callable
from concurrent.futures import Executor, ThreadPoolExecutor
from contextvars import copy_context
from functools import partial

from .config import settings

# Neither of these is the loop's default executor, which is where asyncio resolves getaddrinfo:
# a blocking call parked there queues DNS for every other outbound request behind it. The
# default pool is left to asyncio alone, and every offload in the app goes through this module.
_blocking_work_executor = ThreadPoolExecutor(
    max_workers=settings.blocking_work_max_threads, thread_name_prefix="blocking"
)

# A judge holds its thread for a whole LLM round-trip while carrying a prompt with the full
# source text, so this is at once the memory ceiling, the concurrency ceiling, and the number
# of threads competing with the event loop for the GIL. Private, so the ceiling cannot be
# consumed by work that did not come through `run_geval`.
_geval_executor = ThreadPoolExecutor(
    max_workers=settings.eval_max_concurrent_geval, thread_name_prefix="geval"
)


async def _submit[T](
    executor: Executor,
    function: Callable[..., T],
    args: tuple[object, ...],
    kwargs: dict[str, object],
) -> T:
    # copy_context mirrors what asyncio.to_thread does, and is what carries the structlog
    # contextvars (job_id, mode, provider) into whatever the worker thread logs.
    call = partial(copy_context().run, function, *args, **kwargs)
    return await asyncio.get_running_loop().run_in_executor(executor, call)


async def run_blocking[T](function: Callable[..., T], /, *args: object, **kwargs: object) -> T:
    """`asyncio.to_thread` against a pool this app sizes, rather than the loop's default."""
    return await _submit(_blocking_work_executor, function, args, kwargs)


async def run_geval[T](function: Callable[..., T], /, *args: object, **kwargs: object) -> T:
    """Runs one deepeval judge, bounded by `eval_max_concurrent_geval`."""
    return await _submit(_geval_executor, function, args, kwargs)
