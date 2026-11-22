"""Fact-check claim queries (E8b2): the LLM names the claims worth checking as short English queries."""

import types
from typing import Any, get_origin

import pytest
from langchain_core.messages import AIMessage
from langchain_core.prompt_values import PromptValue
from langchain_core.runnables import RunnableLambda
from pydantic import BaseModel

from app.core.config import settings
from app.services.context_expansion import queries

ARTICLE = "The article insists that drinking coffee cures the common cold."


def _answer_with(claim_count: int) -> dict[str, Any]:
    return {
        "claim_count": claim_count,
        "prompts": [],
    }


@pytest.fixture
def model_calls(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """The model answers `claim_count` claims in every list field and one string in any other field."""
    calls = _answer_with(settings.fact_check_claim_count + 3)

    def fake_structured_llm(schema: type[BaseModel], *_args: object) -> RunnableLambda:
        def answer(prompt: PromptValue) -> dict[str, Any]:
            calls["prompts"].append(
                "\n".join(str(message.content) for message in prompt.to_messages())
            )
            values = {
                name: (
                    [f"claim query {number}" for number in range(calls["claim_count"])]
                    if get_origin(field.annotation) in (list, types.UnionType)
                    or field.annotation is list
                    else "claim query 0"
                )
                for name, field in schema.model_fields.items()
            }
            raw = AIMessage(
                content="ok",
                usage_metadata={"input_tokens": 100, "output_tokens": 20, "total_tokens": 120},
            )
            return {"parsed": schema.model_validate(values), "raw": raw}

        return RunnableLambda(answer)

    monkeypatch.setattr(queries, "build_structured_llm", fake_structured_llm)
    return calls


async def test_plan_claim_queries_caps_at_claim_count(model_calls: dict[str, Any]) -> None:
    claims, usage = await queries.plan_claim_queries(ARTICLE, "gemini", "gemini-3.8-flash")

    assert claims == [f"claim query {number}" for number in range(settings.fact_check_claim_count)]
    assert usage.total_tokens == 120


async def test_plan_claim_queries_keeps_fewer_claims_than_the_cap(
    model_calls: dict[str, Any],
) -> None:
    model_calls["claim_count"] = 2

    claims, _usage = await queries.plan_claim_queries(ARTICLE, "gemini", "gemini-3.8-flash")

    assert claims == ["claim query 0", "claim query 1"]


async def test_plan_claim_queries_sends_the_article_to_the_model(
    model_calls: dict[str, Any],
) -> None:
    await queries.plan_claim_queries(ARTICLE, "gemini", "gemini-3.8-flash")

    assert "cures the common cold" in model_calls["prompts"][0]
