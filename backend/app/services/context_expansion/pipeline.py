import asyncio
import time
from collections.abc import Awaitable, Callable

import httpx
import structlog

from ...core.config import settings
from ...schemas.context_expansion import (
    ChannelOutcome,
    ContextExpansionMode,
    ContextExpansionResult,
    RelatedSource,
    SearchCandidate,
    SearchChannel,
)
from ...schemas.job_db import JobErrorCode
from ...schemas.summary import UsageMetadata
from .exa_search import search_web
from .hn_search import search_discussions
from .openalex_search import search_science
from .queries import plan_search_queries
from .selection import deduplicate_candidates, select_related_sources

log = structlog.get_logger(__name__)

# single_search stands for the naive baseline: the opening of the source used as the query.
_SINGLE_SEARCH_QUERY_CHARS = 200

ChannelSearch = Callable[[list[str]], Awaitable[tuple[list[SearchCandidate], float | None]]]


class ContextExpansionError(RuntimeError):
    code: JobErrorCode = "context_expansion_failed"


def _require_api_keys(mode: ContextExpansionMode) -> None:
    if settings.exa_api_key is None:
        raise ValueError(f"EXA_API_KEY must be set for context expansion mode {mode}")
    if mode == "staged" and settings.openalex_api_key is None:
        raise ValueError(f"OPENALEX_API_KEY must be set for context expansion mode {mode}")


async def _run_channel(
    channel: SearchChannel, search: ChannelSearch, queries: list[str]
) -> tuple[ChannelOutcome, list[SearchCandidate]]:
    """A provider outage is recorded on the outcome so the other channels still feed the summary."""
    started = time.perf_counter()
    try:
        candidates, cost_usd = await search(queries)
    except httpx.HTTPError as error:
        duration_ms = int((time.perf_counter() - started) * 1000)
        log.warning(
            "search channel failed", channel=channel, duration_ms=duration_ms, error=str(error)
        )
        outcome = ChannelOutcome(
            channel=channel,
            queries=queries,
            result_count=0,
            duration_ms=duration_ms,
            cost_usd=None,
            error=f"{type(error).__name__}: {error}",
        )
        return outcome, []

    duration_ms = int((time.perf_counter() - started) * 1000)
    log.info(
        "search channel finished",
        channel=channel,
        result_count=len(candidates),
        duration_ms=duration_ms,
        cost_usd=cost_usd,
    )
    outcome = ChannelOutcome(
        channel=channel,
        queries=queries,
        result_count=len(candidates),
        duration_ms=duration_ms,
        cost_usd=cost_usd,
        error=None,
    )
    return outcome, candidates


async def _search_channels(
    planned: list[tuple[SearchChannel, ChannelSearch, list[str]]],
) -> tuple[list[ChannelOutcome], list[SearchCandidate]]:
    results = await asyncio.gather(*(_run_channel(*channel) for channel in planned))
    outcomes = [outcome for outcome, _candidates in results]
    if all(outcome.error is not None for outcome in outcomes):
        raise ContextExpansionError("every search channel failed")
    candidates = [
        candidate for _outcome, channel_candidates in results for candidate in channel_candidates
    ]
    return outcomes, candidates


async def _expand_single_search(
    source_text: str, source_url: str
) -> tuple[list[ChannelOutcome], int, list[RelatedSource], UsageMetadata]:
    query = source_text[:_SINGLE_SEARCH_QUERY_CHARS]
    outcomes, candidates = await _search_channels([("web", search_web, [query])])
    kept = deduplicate_candidates(candidates, source_url)
    selected = [
        RelatedSource(
            channel=candidate.channel,
            url=candidate.url,
            title=candidate.title,
            excerpt=candidate.text[: settings.context_excerpt_chars],
            selection_reason="single_search",
        )
        for candidate in kept[: settings.context_selected_sources]
    ]
    return outcomes, len(kept), selected, UsageMetadata()


async def _expand_staged(
    source_text: str, source_url: str, model_provider: str, model_name: str
) -> tuple[list[ChannelOutcome], int, list[RelatedSource], UsageMetadata]:
    planned, query_usage = await plan_search_queries(source_text, model_provider, model_name)
    outcomes, candidates = await _search_channels(
        [
            ("web", search_web, planned.web),
            ("discussions", search_discussions, planned.discussions),
            ("science", search_science, planned.science),
        ]
    )
    kept = deduplicate_candidates(candidates, source_url)
    if not kept:
        return outcomes, 0, [], query_usage

    selected, selection_usage = await select_related_sources(
        source_text, kept, model_provider, model_name
    )
    return outcomes, len(kept), selected, query_usage + selection_usage


async def expand_context(
    source_text: str,
    source_url: str,
    mode: ContextExpansionMode,
    model_provider: str,
    model_name: str,
) -> ContextExpansionResult:
    """Finds and selects related sources for one summary; raises ContextExpansionError when every channel failed."""
    log.debug("expanding context", mode=mode, url=source_url)
    if mode == "none":
        return ContextExpansionResult(
            mode=mode,
            channels=[],
            candidate_count=0,
            selected=[],
            usage=UsageMetadata(),
            duration_ms=0,
        )

    _require_api_keys(mode)
    started = time.perf_counter()
    if mode == "single_search":
        outcomes, candidate_count, selected, usage = await _expand_single_search(
            source_text, source_url
        )
    else:
        outcomes, candidate_count, selected, usage = await _expand_staged(
            source_text, source_url, model_provider, model_name
        )

    duration_ms = int((time.perf_counter() - started) * 1000)
    log.info(
        "context expanded",
        mode=mode,
        candidate_count=candidate_count,
        selected_count=len(selected),
        duration_ms=duration_ms,
        token_usage=usage.total_tokens,
    )
    return ContextExpansionResult(
        mode=mode,
        channels=outcomes,
        candidate_count=candidate_count,
        selected=selected,
        usage=usage,
        duration_ms=duration_ms,
    )
