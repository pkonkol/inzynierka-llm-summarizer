"""Regression tests for token accounting across providers.

Reasoning tokens were read from `input_token_details["thinking"]`, a path no provider ever
populates, so `thinking_tokens` was silently 0 on every run. The payloads below are the
shapes langchain-core's UsageMetadata actually carries.
"""

import pytest
from langchain_core.messages import AIMessage
from langchain_core.prompts import ChatPromptTemplate

from app.schemas.summary_spec import SummarySpec
from app.services.llm._base import build_detail_guidance, extract_usage, prompt_texts

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
    guidance = build_detail_guidance(spec, target_words=50, target_sentences=3)
    assert "50 words" in guidance
    assert "3 sentence" in guidance
    assert "Mention the CEO by name." in guidance


def test_detail_guidance_includes_takeaway_instructions_only_for_bullets_output() -> None:
    prose_guidance = build_detail_guidance(SummarySpec(output_format="prose"), 50, 3)
    bullets_guidance = build_detail_guidance(SummarySpec(output_format="bullets"), 50, 3)
    assert "key_takeaways" not in prose_guidance
    assert "key_takeaways" in bullets_guidance
