"""Cases cs17-cs18: the "discussions" channel against the HN Algolia API."""

import asyncio
from collections.abc import Callable
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.context_expansion.hn_search import search_discussions

STORIES = {
    "hits": [
        {
            "objectID": "101",
            "title": "Show HN: a page summarizer",
            "url": "https://tool.example/",
            "story_text": None,
            "created_at_i": 1730419200,
        },
        {
            "objectID": "102",
            "title": "Ask HN: How do you summarize long articles?",
            "url": None,
            "story_text": "<p>I&#x27;m curious what works</p>",
            "created_at_i": 1730505600,
        },
    ]
}
COMMENTS = {
    "101": {
        "hits": [
            {
                "objectID": "201",
                "comment_text": "<p>Great tool, but it misses tables</p>",
                "story_id": 101,
            }
        ]
    },
    "102": {
        "hits": [
            {"objectID": "202", "comment_text": "<p>Read the abstract first</p>", "story_id": 102}
        ]
    },
}


def _story_id_from_tags(tags: str) -> str | None:
    """`comment,story_101` → "101"; a story search has no story_ tag."""
    for tag in tags.split(","):
        if tag.startswith("story_"):
            return tag.removeprefix("story_")
    return None


@pytest.fixture(autouse=True)
def no_backoff_wait(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(asyncio, "sleep", AsyncMock())


async def test_case_17_story_with_comments_becomes_one_candidate(serve_http: Callable) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        story_id = _story_id_from_tags(request.url.params["tags"])
        return httpx.Response(200, json=STORIES if story_id is None else COMMENTS[story_id])

    serve_http(handler)

    candidates, _cost_usd = await search_discussions(["summarize long articles"])

    by_url = {candidate.url: candidate for candidate in candidates}
    assert set(by_url) == {"https://tool.example/", "https://news.ycombinator.com/item?id=102"}
    link_story = by_url["https://tool.example/"]
    assert link_story.channel == "discussions"
    assert "Great tool, but it misses tables" in link_story.text
    assert "<p>" not in link_story.text
    assert link_story.published_at == datetime.fromtimestamp(1730419200, UTC)
    ask_story = by_url["https://news.ycombinator.com/item?id=102"]
    assert "I'm curious what works" in ask_story.text
    assert "Read the abstract first" in ask_story.text


async def test_case_18a_rate_limit_is_retried_once(serve_http: Callable) -> None:
    responses = iter([httpx.Response(429), httpx.Response(200, json={"hits": []})])
    requests_seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests_seen.append(request)
        return next(responses)

    serve_http(handler)

    assert await search_discussions(["summarize long articles"]) == ([], None)
    assert len(requests_seen) == 2


async def test_case_18b_persistent_rate_limit_raises(serve_http: Callable) -> None:
    serve_http(lambda _request: httpx.Response(429))

    with pytest.raises(httpx.HTTPStatusError):
        await search_discussions(["summarize long articles"])
