"""Google Fact Check Tools claims:search (E8b2): one request per claim query."""

import copy
from collections.abc import Callable
from datetime import UTC, datetime

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.services.context_expansion.claim_review_search import search_claim_reviews

API_KEY = "google-secret-key-123"

CLAIM_RESPONSE = {
    "claims": [
        {
            "text": "Coffee cures colds.",
            "claimant": "A blog",
            "claimReview": [
                {
                    "publisher": {"name": "PolitiFact", "site": "politifact.com"},
                    "url": "https://politifact.com/factchecks/coffee",
                    "title": "No, coffee does not cure colds",
                    "textualRating": "False",
                    "languageCode": "en",
                    "reviewDate": "2025-03-04T00:00:00Z",
                },
                {
                    "publisher": {"name": "Second", "site": "second.example"},
                    "url": "https://second.example/coffee",
                    "title": "Second review",
                    "textualRating": "Mostly false",
                },
            ],
        }
    ]
}


@pytest.fixture
def google_requests(serve_http: Callable, monkeypatch: pytest.MonkeyPatch) -> list[httpx.Request]:
    monkeypatch.setattr(settings, "factcheck_api_key", SecretStr(API_KEY))
    received: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        received.append(request)
        return httpx.Response(200, json=CLAIM_RESPONSE)

    serve_http(handler)
    return received


async def test_key_goes_in_header_not_in_url(google_requests: list[httpx.Request]) -> None:
    await search_claim_reviews(["coffee cures colds", "vitamin c prevents colds"])

    assert len(google_requests) == 2
    for request in google_requests:
        assert request.headers["x-goog-api-key"] == API_KEY
        assert API_KEY not in str(request.url)
        assert "key" not in request.url.params


async def test_request_asks_one_english_review_per_query(
    google_requests: list[httpx.Request],
) -> None:
    await search_claim_reviews(["coffee cures colds", "vitamin c prevents colds"])

    assert {request.url.params["query"] for request in google_requests} == {
        "coffee cures colds",
        "vitamin c prevents colds",
    }
    for request in google_requests:
        assert request.method == "GET"
        assert (
            f"{request.url.scheme}://{request.url.host}{request.url.path}"
            == "https://factchecktools.googleapis.com/v1alpha1/claims:search"
        )
        assert request.url.params["languageCode"] == "en"
        assert request.url.params["pageSize"] == "1"


async def test_review_fields_are_mapped_from_the_first_claim_review(
    google_requests: list[httpx.Request],
) -> None:
    candidates, cost_usd = await search_claim_reviews(["coffee cures colds"])

    [candidate] = candidates
    assert candidate.channel == "factcheck_google"
    assert candidate.query == "coffee cures colds"
    assert candidate.url == "https://politifact.com/factchecks/coffee"
    assert candidate.title == "No, coffee does not cure colds"
    assert candidate.review is not None
    assert candidate.review.claim == "Coffee cures colds."
    assert candidate.review.publisher == "PolitiFact"
    assert candidate.review.verdict == "False"
    assert candidate.review.reviewed_at == datetime(2025, 3, 4, tzinfo=UTC)
    assert cost_usd is None


async def test_publisher_without_a_name_falls_back_to_its_site(
    serve_http: Callable, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "factcheck_api_key", SecretStr(API_KEY))
    review = {**CLAIM_RESPONSE["claims"][0]["claimReview"][0], "publisher": {"site": "snopes.com"}}
    del review["reviewDate"]
    serve_http(
        lambda _request: httpx.Response(
            200, json={"claims": [{"text": "Coffee cures colds.", "claimReview": [review]}]}
        )
    )

    [candidate] = (await search_claim_reviews(["coffee"]))[0]

    assert candidate.review is not None
    assert candidate.review.publisher == "snopes.com"
    assert candidate.review.reviewed_at is None


async def test_query_without_claims_returns_no_candidates(
    serve_http: Callable, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "factcheck_api_key", SecretStr(API_KEY))
    serve_http(lambda _request: httpx.Response(200, json={}))

    candidates, cost_usd = await search_claim_reviews(["a claim nobody reviewed"])

    assert candidates == []
    assert cost_usd is None


async def test_missing_api_key_fails_before_any_request(
    serve_http: Callable, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "factcheck_api_key", None)
    received: list[httpx.Request] = []
    serve_http(lambda request: received.append(request) or httpx.Response(200, json={}))

    with pytest.raises(ValueError, match="FACTCHECK_API_KEY"):
        await search_claim_reviews(["coffee"])

    assert received == []


GOOD_CLAIM = {
    "text": "Vitamin C prevents colds.",
    "claimReview": [
        {
            "publisher": {"name": "Snopes"},
            "url": "https://snopes.com/vitamin-c",
            "title": "Vitamin C and colds",
            "textualRating": "Mixture",
        }
    ],
}


def _without_rating() -> dict:
    claim = copy.deepcopy(CLAIM_RESPONSE["claims"][0])
    del claim["claimReview"][0]["textualRating"]
    return claim


def _without_claim_text() -> dict:
    claim = copy.deepcopy(CLAIM_RESPONSE["claims"][0])
    del claim["text"]
    return claim


def _with_review(**changes: object) -> dict:
    claim = copy.deepcopy(CLAIM_RESPONSE["claims"][0])
    claim["claimReview"][0].update(changes)
    return claim


@pytest.mark.parametrize(
    "unusable_claim",
    [
        pytest.param(_without_rating(), id="no-textual-rating"),
        pytest.param(_without_claim_text(), id="no-claim-text"),
        pytest.param(_with_review(publisher={}), id="publisher-without-name-or-site"),
        pytest.param(_with_review(url="javascript:alert(1)"), id="javascript-url"),
        pytest.param(_with_review(url="ftp://politifact.com/coffee"), id="non-http-url"),
    ],
)
async def test_an_unusable_claim_is_skipped_and_the_others_are_kept(
    serve_http: Callable, monkeypatch: pytest.MonkeyPatch, unusable_claim: dict
) -> None:
    monkeypatch.setattr(settings, "factcheck_api_key", SecretStr(API_KEY))
    serve_http(lambda _request: httpx.Response(200, json={"claims": [unusable_claim, GOOD_CLAIM]}))

    candidates, _cost_usd = await search_claim_reviews(["coffee"])

    assert [candidate.url for candidate in candidates] == ["https://snopes.com/vitamin-c"]


async def test_review_title_has_its_html_stripped(
    serve_http: Callable, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "factcheck_api_key", SecretStr(API_KEY))
    serve_http(
        lambda _request: httpx.Response(200, json={"claims": [_with_review(title="<b>Title</b>")]})
    )

    [candidate] = (await search_claim_reviews(["coffee"]))[0]

    assert candidate.title == "Title"
