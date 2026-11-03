"""Cases cs1-cs7 of the agentic-deep-research task: the staged loop around the three search channels."""

from unittest.mock import AsyncMock

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.schemas.context_expansion import (
    ContextExpansionResult,
    PlannedQueries,
    RelatedSource,
    SearchCandidate,
)
from app.schemas.summary import UsageMetadata
from app.services.context_expansion import pipeline
from app.services.context_expansion.pipeline import ContextExpansionError, expand_context

SOURCE_TEXT = "Large language models can summarize web pages for a reader. " * 20
SOURCE_URL = "https://source.example/article"
CHANNEL_FUNCTIONS = ("search_web", "search_discussions", "search_science")


def _candidate(channel: str, url: str) -> SearchCandidate:
    return SearchCandidate.model_validate(
        {"channel": channel, "url": url, "title": "T", "text": "body", "published_at": None}
    )


def _service_unavailable() -> httpx.HTTPStatusError:
    request = httpx.Request("GET", "https://hn.algolia.com/api/v1/search")
    return httpx.HTTPStatusError(
        "503 Service Unavailable", request=request, response=httpx.Response(503, request=request)
    )


async def _expand(mode: str) -> ContextExpansionResult:
    return await expand_context(SOURCE_TEXT, SOURCE_URL, mode, "gemini", "gemini-3.8-flash")


@pytest.fixture
def stages(monkeypatch: pytest.MonkeyPatch) -> dict[str, AsyncMock]:
    monkeypatch.setattr(settings, "exa_api_key", SecretStr("exa-test-key"))
    monkeypatch.setattr(settings, "openalex_api_key", SecretStr("openalex-test-key"))
    selected = RelatedSource(
        channel="web",
        url="https://a.example/1",
        title="T",
        excerpt="body",
        selection_reason="adds the 2025 figures the source lacks",
    )
    mocks = {
        "plan_search_queries": AsyncMock(
            return_value=(
                PlannedQueries(web=["q web"], discussions=["q hn"], science=["q oa"]),
                UsageMetadata(input_tokens=10, output_tokens=5, total_tokens=15),
            )
        ),
        "search_web": AsyncMock(return_value=([_candidate("web", "https://a.example/1")], 0.007)),
        "search_discussions": AsyncMock(
            return_value=(
                [_candidate("discussions", "https://news.ycombinator.com/item?id=1")],
                None,
            )
        ),
        "search_science": AsyncMock(
            return_value=([_candidate("science", "https://doi.org/10.1/x")], 0.001)
        ),
        "select_related_sources": AsyncMock(
            return_value=(
                [selected],
                UsageMetadata(input_tokens=20, output_tokens=4, total_tokens=24),
            )
        ),
    }
    for name, mock in mocks.items():
        # The pipeline binds these names by `from .x import y`; raising=False keeps the test red on behaviour, not on setup.
        monkeypatch.setattr(pipeline, name, mock, raising=False)
    return mocks


async def test_case_1_none_mode_skips_all_channels(stages: dict[str, AsyncMock]) -> None:
    result = await _expand("none")

    for mock in stages.values():
        mock.assert_not_awaited()
    assert result.channels == []
    assert result.selected == []
    assert result.usage.total_tokens == 0


async def test_case_2_staged_mode_returns_selected_sources_with_reasons(
    stages: dict[str, AsyncMock],
) -> None:
    result = await _expand("staged")

    outcomes = {outcome.channel: outcome for outcome in result.channels}
    assert set(outcomes) == {"web", "discussions", "science"}
    assert outcomes["web"].queries == ["q web"]
    assert outcomes["discussions"].queries == ["q hn"]
    assert all(outcome.result_count == 1 and outcome.error is None for outcome in outcomes.values())
    assert result.candidate_count == 3
    assert 0 < len(result.selected) <= settings.context_selected_sources
    assert all(source.selection_reason for source in result.selected)
    assert result.usage.total_tokens == 15 + 24


async def test_case_3_single_search_sends_one_query_without_llm(
    stages: dict[str, AsyncMock],
) -> None:
    result = await _expand("single_search")

    stages["search_web"].assert_awaited_once()
    assert stages["search_web"].await_args.args[0] == [SOURCE_TEXT[:200]]
    for name in (
        "plan_search_queries",
        "select_related_sources",
        "search_discussions",
        "search_science",
    ):
        stages[name].assert_not_awaited()
    assert [outcome.channel for outcome in result.channels] == ["web"]
    assert [source.url for source in result.selected] == ["https://a.example/1"]
    assert result.usage.total_tokens == 0


async def test_case_4_failed_channel_is_recorded_and_others_still_used(
    stages: dict[str, AsyncMock],
) -> None:
    stages["search_discussions"].side_effect = _service_unavailable()

    result = await _expand("staged")

    discussions = next(outcome for outcome in result.channels if outcome.channel == "discussions")
    assert discussions.result_count == 0
    assert discussions.error is not None and "503" in discussions.error
    passed_candidates = stages["select_related_sources"].await_args.args[1]
    assert {candidate.channel for candidate in passed_candidates} == {"web", "science"}


async def test_case_5_all_channels_failed_raises_context_expansion_error(
    stages: dict[str, AsyncMock],
) -> None:
    for name in CHANNEL_FUNCTIONS:
        stages[name].side_effect = _service_unavailable()

    with pytest.raises(ContextExpansionError) as failure:
        await _expand("staged")

    assert failure.value.code == "context_expansion_failed"


async def test_case_6_no_candidates_skips_selection(stages: dict[str, AsyncMock]) -> None:
    for name in CHANNEL_FUNCTIONS:
        stages[name].return_value = ([], None)

    result = await _expand("staged")

    stages["select_related_sources"].assert_not_awaited()
    assert result.selected == []
    assert result.candidate_count == 0


@pytest.mark.parametrize(
    ("setting_name", "env_name"),
    [
        pytest.param("exa_api_key", "EXA_API_KEY", id="exa"),
        pytest.param("openalex_api_key", "OPENALEX_API_KEY", id="openalex"),
    ],
)
async def test_case_7_missing_api_key_fails_before_any_search(
    stages: dict[str, AsyncMock],
    monkeypatch: pytest.MonkeyPatch,
    setting_name: str,
    env_name: str,
) -> None:
    monkeypatch.setattr(settings, setting_name, None)

    with pytest.raises(ValueError, match=env_name):
        await _expand("staged")

    for name in (*CHANNEL_FUNCTIONS, "plan_search_queries"):
        stages[name].assert_not_awaited()
