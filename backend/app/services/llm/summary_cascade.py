"""Cascade summarization — two sequential LLM calls.

Call 1: extract key_takeaways from raw text.
Call 2: write title + summary using ONLY the takeaways (not the full text).

The idea: the second call synthesises from the already-distilled points,
potentially producing a more coherent and focused summary.
"""

from typing import Any

import structlog
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel

from ...schemas.summary import LlmSummaryResult
from ._base import (
    LlmOutputError,
    build_generic_detail_guidance,
    build_structured_llm,
    build_summary_detail_guidance,
    build_takeaway_detail_guidance,
    extract_usage,
    raw_output_str,
)

log = structlog.get_logger(__name__)


class _TakeawaysOnly(BaseModel):
    key_takeaways: list[str]


class _SummaryOnly(BaseModel):
    summary: str


_PROMPT_TAKEAWAYS = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are an expert analyst. Write the entire output in language code: {language}. "
            "Return only valid JSON matching the requested schema.",
        ),
        ("human", "Generate key_takeaways from the content. {detail_guidance}\n\nContent:\n{text}"),
    ]
)

_PROMPT_SYNTHESIS = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are an expert editor. Write the entire output in language code: {language}. "
            "Return only valid JSON matching the requested schema.",
        ),
        (
            "human",
            "Generate summary from the key points. {detail_guidance}\n\nKey points:\n{takeaways}",
        ),
    ]
)


async def run(
    input: dict, source_url: str, model_name: str, model_provider: str, language: str
) -> dict[str, Any]:
    """Two sequential calls: takeaways → synthesis. Returns full result dict."""
    takeaway_llm = build_structured_llm(_TakeawaysOnly, model_provider, model_name)
    summary_llm = build_structured_llm(_SummaryOnly, model_provider, model_name)
    chain_takeaways = _PROMPT_TAKEAWAYS | takeaway_llm
    chain_synthesis = _PROMPT_SYNTHESIS | summary_llm

    log.debug("running cascade summary", mode="cascade", input_text=input)

    text = input["text"]

    takeaways_detail_guidance = "\n".join(
        [
            build_generic_detail_guidance(),
            build_takeaway_detail_guidance(),
        ]
    )
    summary_detail_guidance = "\n".join(
        [
            build_generic_detail_guidance(),
            build_summary_detail_guidance(),
        ]
    )
    params_1 = {
        "language": language,
        "text": text.strip(),
    }

    # --- call 1: extract takeaways ---
    raw_tk: dict[str, Any] | BaseModel = await chain_takeaways.ainvoke(
        {**params_1, "detail_guidance": takeaways_detail_guidance}
    )
    if isinstance(raw_tk, BaseModel):
        raw_tk = raw_tk.model_dump()

    raw_str_tk = raw_output_str(raw_tk)
    parsed_tk: _TakeawaysOnly | None = raw_tk.get("parsed")
    if parsed_tk is None:
        log.error(
            "llm output unparseable", mode="cascade", stage="takeaways", raw_output=raw_str_tk
        )
        raise LlmOutputError(
            "[cascade] model returned unparseable takeaways response",
            raw_output=raw_str_tk,
        )

    # --- call 2: synthesise from takeaways only ---
    params_2 = {
        "language": language,
        "source_url": source_url,
        "takeaways": "\n".join(f"- {item}" for item in parsed_tk.key_takeaways),
        "detail_guidance": summary_detail_guidance,
    }
    raw_sm: dict[str, Any] | BaseModel = await chain_synthesis.ainvoke(params_2)
    if isinstance(raw_sm, BaseModel):
        raw_sm = raw_sm.model_dump()

    raw_str_sm = raw_output_str(raw_sm)
    raw_output_combined = f"--- takeaways ---\n{raw_str_tk}\n--- synthesis ---\n{raw_str_sm}"

    parsed_sm: _SummaryOnly | None = raw_sm.get("parsed")
    if parsed_sm is None:
        log.error(
            "llm output unparseable",
            mode="cascade",
            stage="synthesis",
            raw_output=raw_output_combined,
        )
        raise LlmOutputError(
            "[cascade] model returned unparseable synthesis response",
            raw_output=raw_output_combined,
        )

    usage_tk, meta_tk = extract_usage(raw_tk.get("raw"))
    usage_sm, meta_sm = extract_usage(raw_sm.get("raw"))

    return LlmSummaryResult(
        title=input["title"],
        summary=parsed_sm.summary,
        key_takeaways=parsed_tk.key_takeaways,
        source_url=source_url,
        usage=usage_tk + usage_sm,
        raw_metadata={"takeaways": meta_tk, "synthesis": meta_sm},
        raw_output=raw_output_combined,
        input_text=text.strip(),
        prompt_template=[
            ("[takeaways] system", _PROMPT_TAKEAWAYS.messages[0].prompt.template),
            ("[takeaways] human", _PROMPT_TAKEAWAYS.messages[1].prompt.template),
            ("[synthesis] system", _PROMPT_SYNTHESIS.messages[0].prompt.template),
            ("[synthesis] human", _PROMPT_SYNTHESIS.messages[1].prompt.template),
        ],
        prompt_params={
            "language": language,
            "source_url": source_url,
            "takeaways_detail_guidance": takeaways_detail_guidance,
            "summary_detail_guidance": summary_detail_guidance,
        },
    )
