"""Cases cs8-cs11: which candidates may reach the summary prompt."""

from types import SimpleNamespace
from typing import Any

import pytest
from langchain_core.messages import AIMessage
from langchain_core.prompt_values import PromptValue
from langchain_core.runnables import RunnableLambda
from structlog.testing import capture_logs

from app.core.config import settings
from app.schemas.context_expansion import SearchCandidate
from app.services.context_expansion import selection
from app.services.context_expansion.selection import deduplicate_candidates, select_related_sources

SOURCE_TEXT = "An article about summarizing web pages with language models."


def _candidate(channel: str, url: str) -> SearchCandidate:
    return SearchCandidate.model_validate(
        {
            "channel": channel,
            "url": url,
            "title": "T",
            "text": f"text of {url}",
            "published_at": None,
        }
    )


def _fake_selection_llm(monkeypatch: pytest.MonkeyPatch, picked_urls: list[str]) -> None:
    """The model's answer contract: `picks`, each with the candidate `url` and a `reason`."""
    parsed = SimpleNamespace(
        picks=[SimpleNamespace(url=url, reason=f"why {url}") for url in picked_urls]
    )
    raw = AIMessage(
        content="{}", usage_metadata={"input_tokens": 1, "output_tokens": 1, "total_tokens": 2}
    )

    def answer(_prompt: PromptValue) -> dict[str, Any]:
        return {"parsed": parsed, "raw": raw}

    monkeypatch.setattr(
        selection, "build_structured_llm", lambda *_args: RunnableLambda(answer), raising=False
    )


async def test_case_8_url_outside_the_candidates_is_never_selected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    candidates = [
        _candidate("web", "https://a.example/1"),
        _candidate("science", "https://doi.org/10.1/x"),
    ]
    _fake_selection_llm(monkeypatch, ["https://a.example/1", "https://invented.example/fake"])

    selected, _usage = await select_related_sources(
        SOURCE_TEXT, candidates, "gemini", "gemini-3.8-flash"
    )

    assert [source.url for source in selected] == ["https://a.example/1"]
    assert selected[0].selection_reason == "why https://a.example/1"


async def test_case_9_selection_over_the_limit_keeps_the_first_picks_and_warns(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    urls = [f"https://site{index}.example/" for index in range(6)]
    _fake_selection_llm(monkeypatch, urls)

    with capture_logs() as logs:
        selected, _usage = await select_related_sources(
            SOURCE_TEXT, [_candidate("web", url) for url in urls], "gemini", "gemini-3.8-flash"
        )

    assert [source.url for source in selected] == urls[: settings.context_selected_sources]
    assert any(entry["log_level"] == "warning" for entry in logs)


def test_case_10_duplicate_urls_are_merged_keeping_the_first_channel() -> None:
    candidates = [
        _candidate("web", "https://A.example/post#comments"),
        _candidate("discussions", "https://a.example/post/"),
        _candidate("science", "https://doi.org/10.1/x"),
    ]

    kept = deduplicate_candidates(candidates, "https://source.example/article")

    assert [(candidate.channel, candidate.url) for candidate in kept] == [
        ("web", "https://A.example/post#comments"),
        ("science", "https://doi.org/10.1/x"),
    ]


def test_case_11_source_domain_and_its_subdomains_are_excluded() -> None:
    candidates = [
        _candidate("web", "https://example.com/b"),
        _candidate("web", "https://news.example.com/c"),
        _candidate("web", "https://example.org/d"),
    ]

    kept = deduplicate_candidates(candidates, "https://www.example.com/a")

    assert [candidate.url for candidate in kept] == ["https://example.org/d"]
