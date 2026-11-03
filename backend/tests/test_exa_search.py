"""Cases cs15-cs16: the "web" channel against Exa /search (response shape from the Exa OpenAPI spec)."""

import json
from collections.abc import Callable
from datetime import date

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.services.context_expansion.exa_search import search_web

WEB_RESPONSE = {
    "requestId": "r1",
    "searchType": "neural",
    "results": [
        {
            "url": "https://full.example/a",
            "title": "Full",
            "publishedDate": "2025-06-01",
            "text": "Full text.",
        },
        {
            "url": "https://undated.example/b",
            "title": "Undated",
            "publishedDate": None,
            "text": "Undated text.",
        },
        {
            "url": "https://untitled.example/c",
            "publishedDate": "2025-07-02",
            "text": "Untitled text.",
        },
        {
            "url": "https://empty.example/d",
            "title": "Empty",
            "publishedDate": "2025-08-03",
            "text": "",
        },
    ],
    "costDollars": {"total": 0.008},
}
EMPTY_RESPONSE = {"requestId": "r2", "results": [], "costDollars": {"total": 0.007}}


@pytest.fixture
def exa_requests(serve_http: Callable, monkeypatch: pytest.MonkeyPatch) -> list[httpx.Request]:
    monkeypatch.setattr(settings, "exa_api_key", SecretStr("exa-test-key"))
    received: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        received.append(request)
        body = json.loads(request.content)
        is_reddit_query = body.get("includeDomains") == ["reddit.com"]
        return httpx.Response(200, json=EMPTY_RESPONSE if is_reddit_query else WEB_RESPONSE)

    serve_http(handler)
    return received


async def test_case_15_exa_response_maps_to_candidates(exa_requests: list[httpx.Request]) -> None:
    candidates, _cost_usd = await search_web(["summarization of web pages"])

    by_url = {candidate.url: candidate for candidate in candidates}
    assert set(by_url) == {
        "https://full.example/a",
        "https://undated.example/b",
        "https://untitled.example/c",
    }
    assert all(candidate.channel == "web" for candidate in candidates)
    full = by_url["https://full.example/a"]
    assert full.published_at is not None and full.published_at.date() == date(2025, 6, 1)
    assert full.text == "Full text."
    assert by_url["https://undated.example/b"].published_at is None
    assert by_url["https://untitled.example/c"].title is None


async def test_case_16_exa_request_shape(exa_requests: list[httpx.Request]) -> None:
    await search_web(["summarization of web pages"])

    bodies = [json.loads(request.content) for request in exa_requests]
    assert all(str(request.url) == "https://api.exa.ai/search" for request in exa_requests)
    assert all(request.headers["x-api-key"] == "exa-test-key" for request in exa_requests)
    assert all(body["type"] == "auto" for body in bodies)
    assert all(body["contents"]["text"]["maxCharacters"] > 0 for body in bodies)
    assert any("includeDomains" not in body for body in bodies)
    assert any(body.get("includeDomains") == ["reddit.com"] for body in bodies)
