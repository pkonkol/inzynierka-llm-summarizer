import asyncio
from datetime import datetime

import httpx
import structlog
from pydantic import BaseModel

from ...core.config import settings
from ...schemas.context_expansion import SearchCandidate
from .sanitize import to_prompt_text

log = structlog.get_logger(__name__)

_EXA_SEARCH_URL = "https://api.exa.ai/search"
_TIMEOUT_SECONDS = 20.0


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


async def _search(
    client: httpx.AsyncClient, api_key: str, query: str, include_domains: list[str] | None
) -> _ExaResponse:
    body: dict = {
        "query": query,
        "type": "auto",
        "numResults": settings.context_results_per_query,
        "contents": {"text": {"maxCharacters": settings.context_excerpt_chars}},
    }
    if include_domains is not None:
        body["includeDomains"] = include_domains
    response = await client.post(_EXA_SEARCH_URL, json=body, headers={"x-api-key": api_key})
    response.raise_for_status()
    return _ExaResponse.model_validate(response.json())


async def search_web(queries: list[str]) -> tuple[list[SearchCandidate], float | None]:
    """Exa /search with page text; Reddit as a second query restricted to reddit.com."""
    if settings.exa_api_key is None:
        raise ValueError("EXA_API_KEY must be set to search the web channel")
    api_key = settings.exa_api_key.get_secret_value()
    log.debug("searching exa", query_count=len(queries))

    async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
        responses = await asyncio.gather(
            *(
                _search(client, api_key, query, include_domains)
                for query in queries
                for include_domains in (None, ["reddit.com"])
            )
        )

    candidates = []
    for response in responses:
        for result in response.results:
            text = to_prompt_text(result.text, settings.context_excerpt_chars)
            if not text:
                continue
            candidates.append(
                SearchCandidate(
                    channel="web",
                    url=result.url,
                    title=result.title,
                    text=text,
                    published_at=result.publishedDate,
                )
            )
    cost_usd = sum(response.costDollars.total for response in responses)
    return candidates, cost_usd
