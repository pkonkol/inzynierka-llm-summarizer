import asyncio
from datetime import UTC, date, datetime, time

import httpx
import structlog
from pydantic import BaseModel

from ...core.config import settings
from ...schemas.context_expansion import SearchCandidate
from .sanitize import to_prompt_text

log = structlog.get_logger(__name__)

_OPENALEX_WORKS_URL = "https://api.openalex.org/works"
_TIMEOUT_SECONDS = 20.0


class _Work(BaseModel):
    id: str
    doi: str | None = None
    title: str | None = None
    publication_date: date | None = None
    abstract_inverted_index: dict[str, list[int]] | None = None


class _WorksMeta(BaseModel):
    cost_usd: float


class _WorksResponse(BaseModel):
    meta: _WorksMeta
    results: list[_Work]


def _rebuild_abstract(inverted_index: dict[str, list[int]]) -> str:
    """OpenAlex ships abstracts as {word: [positions]} for licensing reasons."""
    words_by_position = {
        position: word for word, positions in inverted_index.items() for position in positions
    }
    return " ".join(words_by_position[position] for position in sorted(words_by_position))


async def _search(client: httpx.AsyncClient, api_key: str, query: str) -> _WorksResponse:
    response = await client.get(
        _OPENALEX_WORKS_URL,
        params={
            # A filter costs a tenth of `search=` against the daily budget of a free key.
            "filter": f"title_and_abstract.search:{query}",
            "select": "id,title,doi,publication_date,abstract_inverted_index",
            "per-page": settings.context_results_per_query,
            "api_key": api_key,
        },
    )
    response.raise_for_status()
    return _WorksResponse.model_validate(response.json())


def _to_candidate(work: _Work) -> SearchCandidate | None:
    if not work.abstract_inverted_index:
        return None
    text = to_prompt_text(
        _rebuild_abstract(work.abstract_inverted_index), settings.context_excerpt_chars
    )
    published_at = (
        datetime.combine(work.publication_date, time(tzinfo=UTC)) if work.publication_date else None
    )
    return SearchCandidate(
        channel="science",
        url=work.doi or work.id,
        title=work.title,
        text=text,
        published_at=published_at,
    )


async def search_science(queries: list[str]) -> tuple[list[SearchCandidate], float | None]:
    """OpenAlex works matched on title and abstract; works without an abstract are skipped."""
    if settings.openalex_api_key is None:
        raise ValueError("OPENALEX_API_KEY must be set to search the science channel")
    api_key = settings.openalex_api_key.get_secret_value()
    log.debug("searching openalex", query_count=len(queries))

    async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
        responses = await asyncio.gather(*(_search(client, api_key, query) for query in queries))

    works = [work for response in responses for work in response.results]
    candidates = [candidate for candidate in map(_to_candidate, works) if candidate is not None]
    cost_usd = sum(response.meta.cost_usd for response in responses)
    return candidates, cost_usd
