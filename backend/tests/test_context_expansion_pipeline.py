"""Cases cs1-cs7 of the agentic-deep-research task: the staged loop around the three search channels."""

from unittest.mock import AsyncMock

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.schemas.context_expansion import (
    ClaimReview,
    ContextExpansionResult,
    PlannedQueries,
    RelatedSource,
    SearchCandidate,
)
from app.schemas.summary import UsageMetadata
from app.services.context_expansion import pipeline
from app.services.context_expansion.pipeline import (
    ContextExpansionError,
    expand_context,
    search_fact_checks,
)

SOURCE_TEXT = "Large language models can summarize web pages for a reader. " * 20
SOURCE_URL = "https://source.example/article"
CHANNEL_FUNCTIONS = ("search_web", "search_discussions", "search_science")


def _candidate(channel: str, url: str) -> SearchCandidate:
    return SearchCandidate.model_validate(
        {
            "channel": channel,
            "url": url,
            "title": "T",
            "text": "body",
            "published_at": None,
            "review": None,
        }
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
        review=None,
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


CLAIM_REVIEW = ClaimReview(
    claim="Coffee cures colds.",
    publisher="PolitiFact",
    verdict="False",
    reviewed_at=None,
)
GOOGLE_URL = "https://politifact.com/factchecks/coffee"


def _fact_check_candidate(channel: str, url: str, review: ClaimReview | None) -> SearchCandidate:
    return SearchCandidate.model_validate(
        {
            "channel": channel,
            "url": url,
            "title": "T",
            "text": "body",
            "published_at": None,
            "review": review.model_dump() if review else None,
            "query": "coffee cures colds",
        }
    )


@pytest.fixture
def fact_check_stages(monkeypatch: pytest.MonkeyPatch) -> dict[str, AsyncMock]:
    monkeypatch.setattr(settings, "exa_api_key", SecretStr("exa-test-key"))
    monkeypatch.setattr(settings, "factcheck_api_key", SecretStr("google-test-key"))
    mocks = {
        "plan_claim_queries": AsyncMock(
            return_value=(["coffee cures colds"], UsageMetadata(total_tokens=15))
        ),
        "search_claim_reviews": AsyncMock(
            return_value=(
                [_fact_check_candidate("factcheck_google", GOOGLE_URL, CLAIM_REVIEW)],
                None,
            )
        ),
        "search_fact_check_sites": AsyncMock(
            return_value=(
                [_fact_check_candidate("factcheck_web", "https://snopes.com/coffee", None)],
                0.007,
            )
        ),
        "select_related_sources": AsyncMock(side_effect=AssertionError("selection must not run")),
    }
    for name, mock in mocks.items():
        monkeypatch.setattr(pipeline, name, mock, raising=False)
    return mocks


async def _search_fact_checks() -> tuple:
    return await search_fact_checks(SOURCE_TEXT, SOURCE_URL, "gemini", "gemini-3.8-flash")


async def test_fact_check_hits_skip_selection(fact_check_stages: dict[str, AsyncMock]) -> None:
    search, sources = await _search_fact_checks()

    fact_check_stages["select_related_sources"].assert_not_awaited()
    fact_check_stages["search_claim_reviews"].assert_awaited_once()
    assert fact_check_stages["search_claim_reviews"].await_args.args[0] == ["coffee cures colds"]
    assert fact_check_stages["search_fact_check_sites"].await_args.args[0] == ["coffee cures colds"]
    assert {source.url for source in sources} == {GOOGLE_URL, "https://snopes.com/coffee"}
    assert {source.channel for source in sources} == {"factcheck_google", "factcheck_web"}
    assert all(source.selection_reason == "coffee cures colds" for source in sources)
    assert search.claims == ["coffee cures colds"]
    assert {outcome.channel for outcome in search.channels} == {
        "factcheck_google",
        "factcheck_web",
    }
    assert all(outcome.error is None for outcome in search.channels)
    assert search.usage.total_tokens == 15
    assert isinstance(search.duration_ms, int)


async def test_fact_check_hits_carry_the_review_over(
    fact_check_stages: dict[str, AsyncMock],
) -> None:
    _search, sources = await _search_fact_checks()

    by_url = {source.url: source for source in sources}
    assert by_url[GOOGLE_URL].review == CLAIM_REVIEW
    assert by_url["https://snopes.com/coffee"].review is None


async def test_fact_check_hits_are_deduplicated_by_url(
    fact_check_stages: dict[str, AsyncMock],
) -> None:
    fact_check_stages["search_fact_check_sites"].return_value = (
        [_fact_check_candidate("factcheck_web", GOOGLE_URL, None)],
        0.007,
    )

    _search, sources = await _search_fact_checks()

    assert [source.url for source in sources] == [GOOGLE_URL]
    assert sources[0].review == CLAIM_REVIEW  # the Google hit is the one that has a review


async def test_one_failed_fact_check_channel_keeps_the_other(
    fact_check_stages: dict[str, AsyncMock],
) -> None:
    fact_check_stages["search_claim_reviews"].side_effect = _service_unavailable()

    search, sources = await _search_fact_checks()

    google = next(outcome for outcome in search.channels if outcome.channel == "factcheck_google")
    assert google.result_count == 0
    assert google.error is not None and "503" in google.error
    assert [source.url for source in sources] == ["https://snopes.com/coffee"]


async def test_all_fact_check_channels_failed_raises_context_expansion_error(
    fact_check_stages: dict[str, AsyncMock],
) -> None:
    fact_check_stages["search_claim_reviews"].side_effect = _service_unavailable()
    fact_check_stages["search_fact_check_sites"].side_effect = _service_unavailable()

    with pytest.raises(ContextExpansionError):
        await _search_fact_checks()


async def test_fact_check_without_hits_returns_no_sources(
    fact_check_stages: dict[str, AsyncMock],
) -> None:
    fact_check_stages["search_claim_reviews"].return_value = ([], None)
    fact_check_stages["search_fact_check_sites"].return_value = ([], None)

    search, sources = await _search_fact_checks()

    assert sources == []
    assert search.claims == ["coffee cures colds"]
