"""Sequential summarization — two independent LLM calls.

Call 1: extract key_takeaways from raw text.
Call 2: write title + summary from raw text (independently).

Both calls run concurrently (asyncio.gather). The two usages are summed.
"""
import asyncio
import logging

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

logger = logging.getLogger(__name__)


class _TakeawaysOnly(BaseModel):
    key_takeaways: list[str]


class _SummaryOnly(BaseModel):
    summary: str


_PROMPT_TAKEAWAYS = ChatPromptTemplate.from_messages([
    ("system",
     "You are an expert analyst. Write the entire output in language code: {language}. "
     "Return only valid JSON matching the requested schema."),
    ("human",
    "Generate key_takeaways from the content. {detail_guidance}\n\n"
     "Content:\n{text}"),
])

_PROMPT_SUMMARY = ChatPromptTemplate.from_messages([
    ("system",
     "You are an expert summarizer. Write the entire output in language code: {language}. "
     "Return only valid JSON matching the requested schema."),
    ("human",
    "Generate summary from the content. {detail_guidance}\n\n"
     "Content:\n{text}"),
])


async def run(
    input: dict, source_url: str, model_name: str, model_provider: str, language: str
) -> LlmSummaryResult:
    """Two independent calls run concurrently, their results merged."""
    takeaway_llm = build_structured_llm(_TakeawaysOnly, model_provider, model_name)
    summary_llm = build_structured_llm(_SummaryOnly, model_provider, model_name)
    chain_takeaways = _PROMPT_TAKEAWAYS | takeaway_llm
    chain_summary   = _PROMPT_SUMMARY   | summary_llm

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
    base_params = {
        "language": language,
        "text": text.strip(),
    }

    (raw_tk, raw_sm) = await asyncio.gather(
        chain_takeaways.ainvoke({**base_params, "detail_guidance": takeaways_detail_guidance}),
        chain_summary.ainvoke({**base_params, "detail_guidance": summary_detail_guidance}),
    )

    raw_tk = raw_tk.model_dump() if isinstance(raw_tk, BaseModel) else raw_tk
    raw_sm = raw_sm.model_dump() if isinstance(raw_sm, BaseModel) else raw_sm

    raw_str_tk = raw_output_str(raw_tk)
    raw_str_sm = raw_output_str(raw_sm)

    parsed_tk: _TakeawaysOnly | None = raw_tk.get("parsed")
    parsed_sm: _SummaryOnly   | None = raw_sm.get("parsed")

    raw_output_combined = f"--- takeaways ---\n{raw_str_tk}\n--- summary ---\n{raw_str_sm}"

    if parsed_tk is None or parsed_sm is None:
        missing = "takeaways" if parsed_tk is None else "summary"
        logger.error("raw_output: %s", raw_output_combined)
        raise LlmOutputError(
            f"[sequential] model returned unparseable {missing} response",
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
        raw_metadata={"takeaways": meta_tk, "summary": meta_sm},
        raw_output=raw_output_combined,
        input_text=text.strip(),
        prompt_template=[
            ("[takeaways] system", _PROMPT_TAKEAWAYS.messages[0].prompt.template), # pyright: ignore[reportAttributeAccessIssue]
            ("[takeaways] human",  _PROMPT_TAKEAWAYS.messages[1].prompt.template), # pyright: ignore[reportAttributeAccessIssue]
            ("[summary] system",   _PROMPT_SUMMARY.messages[0].prompt.template), # pyright: ignore[reportAttributeAccessIssue]
            ("[summary] human",    _PROMPT_SUMMARY.messages[1].prompt.template), # pyright: ignore[reportAttributeAccessIssue]
        ],
        prompt_params={
            "language": language,
            "takeaways_detail_guidance": takeaways_detail_guidance,
            "summary_detail_guidance": summary_detail_guidance,
        },
    )
