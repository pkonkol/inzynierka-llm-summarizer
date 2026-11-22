"""Cases cs15-cs16: the "web" channel against Exa /search (response shape from the Exa OpenAPI spec)."""

import json
from collections.abc import Callable
from datetime import date

import httpx
import pytest
from pydantic import SecretStr
from structlog.testing import capture_logs

from app.core.config import settings
from app.services.context_expansion.exa_search import (
    FACT_CHECK_DOMAINS,
    search_fact_check_sites,
    search_web,
)

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


EXPECTED_FACT_CHECK_DOMAINS = {
    "politifact.com",
    "fullfact.org",
    "science.feedback.org",
    "healthfeedback.org",
    "snopes.com",
    "factcheck.org",
    "factcheck.afp.com",
    "leadstories.com",
}


def test_fact_check_domains_are_the_agreed_sites() -> None:
    assert set(FACT_CHECK_DOMAINS) == EXPECTED_FACT_CHECK_DOMAINS


async def test_fact_check_sites_restrict_domains_and_ask_one_result(
    exa_requests: list[httpx.Request],
) -> None:
    await search_fact_check_sites(["coffee cures colds", "vitamin c prevents colds"])

    bodies = [json.loads(request.content) for request in exa_requests]
    assert {body["query"] for body in bodies} == {"coffee cures colds", "vitamin c prevents colds"}
    assert len(bodies) == 2  # one request per query, no Reddit side query
    for body in bodies:
        assert set(body["includeDomains"]) == EXPECTED_FACT_CHECK_DOMAINS
        assert body["numResults"] == 1


async def test_fact_check_sites_candidates_use_the_factcheck_web_channel(
    exa_requests: list[httpx.Request],
) -> None:
    candidates, _cost_usd = await search_fact_check_sites(["coffee cures colds"])

    assert candidates
    assert all(candidate.channel == "factcheck_web" for candidate in candidates)
    assert all(candidate.review is None for candidate in candidates)
    assert all(candidate.query == "coffee cures colds" for candidate in candidates)


async def test_exa_warnings_are_logged(
    serve_http: Callable, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "exa_api_key", SecretStr("exa-test-key"))
    serve_http(
        lambda _request: httpx.Response(
            200,
            json={
                **EMPTY_RESPONSE,
                "warnings": ["includeDomains was trimmed"],
                "notices": ["rate limit nearly reached"],
            },
        )
    )

    with capture_logs() as logs:
        await search_web(["summarization of web pages"])

    warned = " ".join(str(entry) for entry in logs if entry["log_level"] == "warning")
    assert "includeDomains was trimmed" in warned
    assert "rate limit nearly reached" in warned


async def test_empty_exa_warnings_log_nothing_at_warning_level(
    serve_http: Callable, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "exa_api_key", SecretStr("exa-test-key"))
    serve_http(
        lambda _request: httpx.Response(200, json={**EMPTY_RESPONSE, "warnings": [], "notices": []})
    )

    with capture_logs() as logs:
        await search_web(["summarization of web pages"])

    assert [entry for entry in logs if entry["log_level"] == "warning"] == []


NON_HTTP_RESPONSE = {
    "requestId": "r3",
    "results": [
        {"url": "javascript:alert(1)", "title": "Script", "text": "Script text."},
        {"url": "ftp://files.example/a", "title": "Ftp", "text": "Ftp text."},
        {"url": "https://kept.example/a", "title": "Kept", "text": "Kept text."},
    ],
    "costDollars": {"total": 0.008},
}


@pytest.mark.parametrize("search", [search_web, search_fact_check_sites])
async def test_a_result_with_a_non_http_url_is_dropped_and_the_others_are_kept(
    serve_http: Callable, monkeypatch: pytest.MonkeyPatch, search: Callable
) -> None:
    monkeypatch.setattr(settings, "exa_api_key", SecretStr("exa-test-key"))
    serve_http(lambda _request: httpx.Response(200, json=NON_HTTP_RESPONSE))

    candidates, _cost_usd = await search(["coffee cures colds"])

    assert {candidate.url for candidate in candidates} == {"https://kept.example/a"}
