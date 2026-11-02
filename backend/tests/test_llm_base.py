"""Regression tests for token accounting across providers.

Reasoning tokens were read from `input_token_details["thinking"]`, a path no provider ever
populates, so `thinking_tokens` was silently 0 on every run. The payloads below are the
shapes langchain-core's UsageMetadata actually carries.
"""

import pytest
from langchain_core.messages import AIMessage
from langchain_core.prompts import ChatPromptTemplate
from pydantic import SecretStr

from app.schemas.summary_spec import ResolvedLength, SummarySpec
from app.services.llm import _base
from app.services.llm._base import (
    BULLETS_FORMAT_GUIDANCE,
    build_detail_guidance,
    build_llm,
    extract_usage,
    prompt_texts,
)

GEMINI = {
    "input_tokens": 1000,
    "output_tokens": 200,
    "total_tokens": 1450,
    "input_token_details": {"cache_read": 0},
    "output_token_details": {"reasoning": 250},
}
OPENAI = {
    "input_tokens": 800,
    "output_tokens": 300,
    "total_tokens": 1100,
    "output_token_details": {"reasoning": 120, "audio": 0},
}
_LENGTH = ResolvedLength(target_words=50, target_sentences=3)
OLLAMA = {"input_tokens": 10, "output_tokens": 3615, "total_tokens": 3625}


@pytest.mark.parametrize(
    ("usage_metadata", "expected"),
    [
        pytest.param(GEMINI, 250, id="gemini-reports-reasoning"),
        pytest.param(OPENAI, 120, id="openai-reports-reasoning"),
        pytest.param(OLLAMA, 0, id="ollama-reports-none"),
    ],
)
def test_reasoning_tokens_are_recorded(usage_metadata: dict, expected: int) -> None:
    usage, _ = extract_usage(AIMessage(content="x", usage_metadata=usage_metadata))
    assert usage.thinking_tokens == expected


def test_total_is_backfilled_when_a_provider_reports_zero() -> None:
    usage, _ = extract_usage(
        AIMessage(
            content="x",
            usage_metadata={"input_tokens": 5, "output_tokens": 7, "total_tokens": 0},
        )
    )
    assert usage.total_tokens == 12


def test_missing_usage_metadata_yields_zeros() -> None:
    usage, raw = extract_usage(AIMessage(content="x"))
    assert usage.total_tokens == 0
    assert "usage_metadata" not in raw


def test_prompt_texts_handles_a_two_message_template() -> None:
    prompt = ChatPromptTemplate.from_messages([("system", "sys {x}"), ("human", "human {x}")])
    texts = prompt_texts(prompt, "label")
    assert [t for _, t in texts] == ["sys {x}", "human {x}"]


def test_prompt_texts_handles_a_three_message_template() -> None:
    """Every real prompt in _prompts.py is 3 messages: system, human, reminder — this is the
    shape prompt_texts() was generalized for.
    """
    prompt = ChatPromptTemplate.from_messages(
        [("system", "sys {x}"), ("human", "human {x}"), ("human", "reminder {x}")]
    )
    texts = prompt_texts(prompt, "label")
    assert [t for _, t in texts] == ["sys {x}", "human {x}", "reminder {x}"]


def test_detail_guidance_repeats_the_length_target_and_extra_instructions() -> None:
    spec = SummarySpec(extra_instructions="Mention the CEO by name.")
    guidance = build_detail_guidance(spec, _LENGTH)
    assert "50 words" in guidance
    assert "3 sentence" in guidance
    assert "Mention the CEO by name." in guidance


def test_detail_guidance_asks_for_a_markdown_list_only_for_bullets_output() -> None:
    prose_guidance = build_detail_guidance(SummarySpec(output_format="prose"), _LENGTH)
    bullets_guidance = build_detail_guidance(SummarySpec(output_format="bullets"), _LENGTH)
    assert BULLETS_FORMAT_GUIDANCE not in prose_guidance
    assert BULLETS_FORMAT_GUIDANCE in bullets_guidance
    assert "key_takeaways" not in bullets_guidance  # the final answer is a summary, not a JSON list


@pytest.mark.parametrize("provider", ["gemini", "openrouter", "ollama"])
def test_build_llm_passes_configured_temperature(
    monkeypatch: pytest.MonkeyPatch, provider: str
) -> None:
    monkeypatch.setattr(
        _base.settings, "supported_models", {"gemini": ["m"], "openrouter": ["m"], "ollama": ["m"]}
    )
    monkeypatch.setattr(_base.settings, "gemini_api_key", SecretStr("test-key"))
    monkeypatch.setattr(_base.settings, "openrouter_api_key", SecretStr("test-key"))
    monkeypatch.setattr(_base.settings, "llm_temperature", 0.7)

    assert build_llm(provider, "m").temperature == 0.7


@pytest.mark.parametrize(
    ("thinking_models", "expected_reasoning"),
    [([], False), (["m"], True)],
    ids=["model_off_the_list_does_not_think", "model_on_the_list_thinks"],
)
def test_ollama_reasoning_follows_thinking_list(
    monkeypatch: pytest.MonkeyPatch, thinking_models: list[str], expected_reasoning: bool
) -> None:
    monkeypatch.setattr(_base.settings, "supported_models", {"ollama": ["m"]})
    monkeypatch.setattr(_base.settings, "ollama_thinking_models", thinking_models)

    assert build_llm("ollama", "m").reasoning is expected_reasoning
