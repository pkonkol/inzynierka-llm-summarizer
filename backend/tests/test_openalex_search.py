"""Case cs19: the "science" channel against OpenAlex /works."""

from collections.abc import Callable
from datetime import date

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.services.context_expansion.openalex_search import search_science

WORKS = {
    "meta": {"count": 3, "cost_usd": 0.001},
    "results": [
        {
            "id": "https://openalex.org/W1",
            "doi": "https://doi.org/10.1/abc",
            "title": "LLM summarization",
            "publication_date": "2025-03-14",
            "abstract_inverted_index": {"LLMs": [0], "summarize": [1], "text": [2]},
        },
        {
            "id": "https://openalex.org/W2",
            "doi": "https://doi.org/10.1/no-abstract",
            "title": "No abstract",
            "publication_date": "2024-01-01",
            "abstract_inverted_index": None,
        },
        {
            "id": "https://openalex.org/W3",
            "doi": None,
            "title": "Without DOI",
            "publication_date": "2023-05-05",
            "abstract_inverted_index": {"web": [1], "Summarizing": [0], "pages": [2]},
        },
    ],
}


async def test_case_19_openalex_works_map_to_candidates(
    serve_http: Callable, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "openalex_api_key", SecretStr("openalex-test-key"))
    requests_seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests_seen.append(request)
        return httpx.Response(200, json=WORKS)

    serve_http(handler)

    candidates, _cost_usd = await search_science(["llm summarization"])

    params = requests_seen[0].url.params
    assert requests_seen[0].url.path == "/works"
    assert params["filter"].startswith("title_and_abstract.search:")
    assert params["api_key"] == "openalex-test-key"
    by_url = {candidate.url: candidate for candidate in candidates}
    assert set(by_url) == {"https://doi.org/10.1/abc", "https://openalex.org/W3"}
    assert by_url["https://doi.org/10.1/abc"].text == "LLMs summarize text"
    assert by_url["https://openalex.org/W3"].text == "Summarizing web pages"
    published = by_url["https://doi.org/10.1/abc"].published_at
    assert published is not None and published.date() == date(2025, 3, 14)
    assert all(candidate.channel == "science" for candidate in candidates)
