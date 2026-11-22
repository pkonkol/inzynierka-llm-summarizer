import asyncio
from datetime import datetime
from typing import Any

import httpx
import structlog
from pydantic import BaseModel

from ...core.config import settings
from ...schemas.context_expansion import SearchCandidate, SearchChannel
from .sanitize import to_prompt_text

log = structlog.get_logger(__name__)

_EXA_SEARCH_URL = "https://api.exa.ai/search"
_TIMEOUT_SECONDS = 20.0

# Measured 2026-11: whole apnews.com and reuters.com flood the results with ordinary news.
FACT_CHECK_DOMAINS = [
    "politifact.com",
    "fullfact.org",
    "science.feedback.org",
    "healthfeedback.org",
    "snopes.com",
    "factcheck.org",
    "factcheck.afp.com",
    "leadstories.com",
]


class _ExaResult(BaseModel):
    url: str
    title: str | None = None
    publishedDate: datetime | None = None
    text: str


class _ExaCost(BaseModel):
    total: float


class _ExaResponse(BaseModel):
    results: list[_ExaResult]
    costDollars: _ExaCost
    # Exa reports ignored or deprecated request options here instead of failing the request.
    warnings: list[Any] = []
    notices: list[Any] = []


async def _search(
    client: httpx.AsyncClient,
    api_key: str,
    query: str,
    include_domains: list[str] | None,
    num_results: int,
) -> _ExaResponse:
    body: dict = {
        "query": query,
        "type": "auto",
        "numResults": num_results,
        "contents": {"text": {"maxCharacters": settings.context_excerpt_chars}},
    }
    if include_domains is not None:
        body["includeDomains"] = include_domains
    response = await client.post(_EXA_SEARCH_URL, json=body, headers={"x-api-key": api_key})
    response.raise_for_status()
    parsed = _ExaResponse.model_validate(response.json())
    if parsed.warnings or parsed.notices:
        log.warning("exa reported warnings", warnings=parsed.warnings, notices=parsed.notices)
    return parsed


def _require_api_key() -> str:
    if settings.exa_api_key is None:
        raise ValueError("EXA_API_KEY must be set to search with Exa")
    return settings.exa_api_key.get_secret_value()


def _candidates(
    responses: list[_ExaResponse], channel: SearchChannel, queries: list[str | None]
) -> list[SearchCandidate]:
    candidates = []
    for query, response in zip(queries, responses, strict=True):
        for result in response.results:
            text = to_prompt_text(result.text, settings.context_excerpt_chars)
            if not text:
                continue
            candidates.append(
                SearchCandidate(
                    channel=channel,
                    url=result.url,
                    title=result.title,
                    text=text,
                    published_at=result.publishedDate,
                    query=query,
                )
            )
    return candidates


async def search_web(queries: list[str]) -> tuple[list[SearchCandidate], float | None]:
    """Exa /search with page text; Reddit as a second query restricted to reddit.com."""
    api_key = _require_api_key()
    log.debug("searching exa", query_count=len(queries))

    async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
        responses = await asyncio.gather(
            *(
                _search(client, api_key, query, include_domains, settings.context_results_per_query)
                for query in queries
                for include_domains in (None, ["reddit.com"])
            )
        )
    cost_usd = sum(response.costDollars.total for response in responses)
    return _candidates(responses, "web", [None] * len(responses)), cost_usd


async def search_fact_check_sites(queries: list[str]) -> tuple[list[SearchCandidate], float | None]:
    """Exa /search restricted to FACT_CHECK_DOMAINS, one result per claim query."""
    api_key = _require_api_key()
    log.debug("searching exa fact check sites", query_count=len(queries))

    async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
        responses = await asyncio.gather(
            *(_search(client, api_key, query, FACT_CHECK_DOMAINS, 1) for query in queries)
        )
    cost_usd = sum(response.costDollars.total for response in responses)
    return _candidates(responses, "factcheck_web", list(queries)), cost_usd
