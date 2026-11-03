import asyncio
from datetime import UTC, datetime

import httpx
import structlog
from pydantic import BaseModel

from ...core.config import settings
from ...schemas.context_expansion import SearchCandidate
from .sanitize import to_prompt_text

log = structlog.get_logger(__name__)

_HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search"
_HN_ITEM_URL = "https://news.ycombinator.com/item?id="
_TIMEOUT_SECONDS = 20.0
_RETRY_DELAYS_SECONDS = (1.0, 2.0)  # Algolia publishes no rate limit, but answers bursts with 429
_COMMENTS_PER_STORY = 5


class _Story(BaseModel):
    objectID: str
    title: str
    url: str | None = None
    story_text: str | None = None
    created_at_i: int


class _Comment(BaseModel):
    comment_text: str | None = None


class _StoryHits(BaseModel):
    hits: list[_Story]


class _CommentHits(BaseModel):
    hits: list[_Comment]


async def _get_with_retry(client: httpx.AsyncClient, params: dict[str, str | int]) -> dict:
    for delay in _RETRY_DELAYS_SECONDS:
        response = await client.get(_HN_SEARCH_URL, params=params)
        if response.status_code != httpx.codes.TOO_MANY_REQUESTS:
            break
        log.warning("hn rate limited, retrying", delay_seconds=delay)
        await asyncio.sleep(delay)
    else:
        response = await client.get(_HN_SEARCH_URL, params=params)
    response.raise_for_status()
    return response.json()


async def _story_candidate(client: httpx.AsyncClient, story: _Story) -> SearchCandidate | None:
    comments = _CommentHits.model_validate(
        await _get_with_retry(
            client,
            {"tags": f"comment,story_{story.objectID}", "hitsPerPage": _COMMENTS_PER_STORY},
        )
    )
    story_html = [story.story_text] if story.story_text else []
    html_parts = story_html + [
        comment.comment_text for comment in comments.hits if comment.comment_text
    ]
    paragraphs = [to_prompt_text(part, settings.context_excerpt_chars) for part in html_parts]
    text = "\n\n".join(paragraph for paragraph in paragraphs if paragraph)[
        : settings.context_excerpt_chars
    ]
    if not text:
        return None
    return SearchCandidate(
        channel="discussions",
        url=story.url or f"{_HN_ITEM_URL}{story.objectID}",
        title=story.title,
        text=text,
        published_at=datetime.fromtimestamp(story.created_at_i, UTC),
    )


async def search_discussions(queries: list[str]) -> tuple[list[SearchCandidate], float | None]:
    """HN Algolia stories and the top comments of each; the API is free, so there is no cost."""
    log.debug("searching hn", query_count=len(queries))
    async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
        story_pages = await asyncio.gather(
            *(
                _get_with_retry(
                    client,
                    {
                        "query": query,
                        "tags": "story",
                        "hitsPerPage": settings.context_results_per_query,
                    },
                )
                for query in queries
            )
        )
        stories = [story for page in story_pages for story in _StoryHits.model_validate(page).hits]
        candidates = await asyncio.gather(*(_story_candidate(client, story) for story in stories))
    return [candidate for candidate in candidates if candidate is not None], None
