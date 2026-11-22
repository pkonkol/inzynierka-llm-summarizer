import asyncio
from datetime import datetime

import httpx
import structlog
from pydantic import BaseModel

from ...core.config import settings
from ...schemas.context_expansion import ClaimReview, SearchCandidate
from .sanitize import to_prompt_text

log = structlog.get_logger(__name__)

_CLAIM_SEARCH_URL = "https://factchecktools.googleapis.com/v1alpha1/claims:search"
_TIMEOUT_SECONDS = 20.0


class _Publisher(BaseModel):
    name: str | None = None  # Google leaves it out for some publishers, which then have only a site
    site: str | None = None


class _ClaimReview(BaseModel):
    publisher: _Publisher
    url: str
    title: str | None = None
    reviewDate: datetime | None = None
    textualRating: str


class _Claim(BaseModel):
    text: str
    claimReview: list[_ClaimReview]


class _ClaimSearchResponse(BaseModel):
    claims: list[_Claim] = []  # an empty result is an empty JSON object


def _publisher_name(publisher: _Publisher) -> str:
    name = publisher.name or publisher.site
    if name is None:
        raise ValueError("claim review publisher has neither a name nor a site")
    return name


def _candidate(claim: _Claim, query: str) -> SearchCandidate | None:
    if not claim.claimReview:
        return None
    first_review = claim.claimReview[0]
    text = to_prompt_text(first_review.title or claim.text, settings.context_excerpt_chars)
    if not text:
        return None
    return SearchCandidate(
        channel="factcheck_google",
        url=first_review.url,
        title=first_review.title,
        text=text,
        published_at=first_review.reviewDate,
        query=query,
        review=ClaimReview(
            claim=to_prompt_text(claim.text, settings.context_excerpt_chars),
            publisher=_publisher_name(first_review.publisher),
            verdict=to_prompt_text(first_review.textualRating, settings.context_excerpt_chars),
            reviewed_at=first_review.reviewDate,
        ),
    )


async def _search(client: httpx.AsyncClient, api_key: str, query: str) -> _ClaimSearchResponse:
    response = await client.get(
        _CLAIM_SEARCH_URL,
        params={"query": query, "languageCode": "en", "pageSize": 1},
        # In the header: httpx logs the request URL at INFO, and a ?key= would land in Cloud Logging.
        headers={"X-Goog-Api-Key": api_key},
    )
    response.raise_for_status()
    return _ClaimSearchResponse.model_validate(response.json())


async def search_claim_reviews(queries: list[str]) -> tuple[list[SearchCandidate], float | None]:
    """Google Fact Check Tools claims:search, one claim review per query; the API is free, so there is no cost."""
    if settings.factcheck_api_key is None:
        raise ValueError("FACTCHECK_API_KEY must be set to search the factcheck_google channel")
    api_key = settings.factcheck_api_key.get_secret_value()
    log.debug("searching google fact check", query_count=len(queries))

    async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
        responses = await asyncio.gather(*(_search(client, api_key, query) for query in queries))

    candidates = [
        _candidate(claim, query)
        for query, response in zip(queries, responses, strict=True)
        for claim in response.claims
    ]
    return [candidate for candidate in candidates if candidate is not None], None
