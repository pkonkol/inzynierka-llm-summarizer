import asyncio
from datetime import datetime
from typing import Any, Self, cast

import httpx
import structlog
from pydantic import BaseModel, ValidationError, model_validator

from ...core.config import settings
from ...schemas.context_expansion import ClaimReview, SearchCandidate
from .sanitize import to_prompt_text

log = structlog.get_logger(__name__)

_CLAIM_SEARCH_URL = "https://factchecktools.googleapis.com/v1alpha1/claims:search"
_TIMEOUT_SECONDS = 20.0


class _Publisher(BaseModel):
    name: str | None = None  # Google leaves it out for some publishers, which then have only a site
    site: str | None = None

    @model_validator(mode="after")
    def _require_name_or_site(self) -> Self:
        if self.name is None and self.site is None:
            raise ValueError("claim review publisher has neither a name nor a site")
        return self

    @property
    def label(self) -> str:
        return cast(str, self.name or self.site)


class _ClaimReview(BaseModel):
    publisher: _Publisher
    url: str
    title: str | None = None
    reviewDate: datetime | None = None
    textualRating: str

    @model_validator(mode="after")
    def _require_web_url(self) -> Self:
        # The url ends up in a link on the public page, so a javascript: scheme must not get through.
        if not self.url.startswith(("https://", "http://")):
            raise ValueError("claim review url is not http(s)")
        return self


class _Claim(BaseModel):
    text: str
    claimReview: list[_ClaimReview]


class _ClaimSearchResponse(BaseModel):
    claims: list[dict[str, Any]] = []  # an empty result is an empty JSON object


def _parse_claim(raw_claim: dict[str, Any]) -> _Claim | None:
    """One incomplete record from Google drops that claim alone, never the whole channel."""
    try:
        claim = _Claim.model_validate(raw_claim)
    except ValidationError as error:
        log.warning("incomplete google claim skipped", error_count=error.error_count())
        return None
    if not claim.claimReview:
        return None
    return claim


def _candidate(claim: _Claim, query: str) -> SearchCandidate | None:
    first_review = claim.claimReview[0]
    text = to_prompt_text(first_review.title or claim.text, settings.context_excerpt_chars)
    if not text:
        return None
    title = (
        to_prompt_text(first_review.title, settings.context_excerpt_chars)
        if first_review.title
        else None
    )
    return SearchCandidate(
        channel="factcheck_google",
        url=first_review.url,
        title=title,
        text=text,
        published_at=first_review.reviewDate,
        query=query,
        review=ClaimReview(
            claim=to_prompt_text(claim.text, settings.context_excerpt_chars),
            publisher=to_prompt_text(first_review.publisher.label, settings.context_excerpt_chars),
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

    claims_by_query = [
        (query, claim)
        for query, response in zip(queries, responses, strict=True)
        for claim in map(_parse_claim, response.claims)
        if claim is not None
    ]
    candidates = [_candidate(claim, query) for query, claim in claims_by_query]
    return [candidate for candidate in candidates if candidate is not None], None
