"""Sequential summarization — two independent LLM calls.

Call 1: extract key_takeaways from raw text.
Call 2: write title + summary from raw text (independently).

Both calls run concurrently (asyncio.gather). The two usages are summed.
"""
import asyncio
import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel

from ...schemas.summary import SummaryResponse
from ._base import (
    build_generic_detail_guidance,
    build_structured_llm,
    build_summary_detail_guidance,
    build_takeaway_detail_guidance,
    extract_usage,
    raw_output_str,
)

logger = logging.getLogger(__name__)


class _TakeawaysOnly(BaseModel):
    key_takeaways: str


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
    trafilatura: dict, source_url: str, model_name: str, model_provider: str, language: str
) -> dict[str, Any]:
    """Two independent calls run concurrently. Returns merged full result dict."""
    takeaway_llm = build_structured_llm(_TakeawaysOnly, model_provider, model_name)
    summary_llm = build_structured_llm(_SummaryOnly, model_provider, model_name)
    chain_takeaways = _PROMPT_TAKEAWAYS | takeaway_llm
    chain_summary   = _PROMPT_SUMMARY   | summary_llm

    text = trafilatura["text"]

    takeaways_detail_guidance = "\n".join(
        [
            build_generic_detail_guidance(text),
            build_takeaway_detail_guidance(text),
        ]
    )
    summary_detail_guidance = "\n".join(
        [
            build_generic_detail_guidance(text),
            build_summary_detail_guidance(text),
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

    if parsed_tk is None or parsed_sm is None:
        missing = "takeaways" if parsed_tk is None else "summary"
        err = ValueError(f"[sequential] model returned unparseable {missing} response")
        s = f"--- takeaways ---\n{raw_str_tk}\n--- summary ---\n{raw_str_sm}"  # type: ignore[attr-defined]
        err.raw_output = s # type: ignore[attr-defined]
        logger.error("raw_output: %s", s)
        raise err

    usage_tk, meta_tk = extract_usage(raw_tk.get("raw"))
    usage_sm, meta_sm = extract_usage(raw_sm.get("raw"))

    combined_usage = {
        "input_tokens":   usage_tk.input_tokens   + usage_sm.input_tokens,
        "output_tokens":  usage_tk.output_tokens  + usage_sm.output_tokens,
        "thinking_tokens":usage_tk.thinking_tokens + usage_sm.thinking_tokens,
        "total_tokens":   usage_tk.total_tokens   + usage_sm.total_tokens,
    }
    combined_meta = {"takeaways": meta_tk, "summary": meta_sm}
    raw_output_combined = f"--- takeaways ---\n{raw_str_tk}\n--- summary ---\n{raw_str_sm}"

    result = SummaryResponse(
        title=trafilatura["title"],
        summary=parsed_sm.summary,
        key_takeaways=parsed_tk.key_takeaways,
        source_url=source_url,
    ).model_dump()

    result["author"] = trafilatura["author"]
    result["title"] = trafilatura["title"]
    result["source_url"] = source_url
    result["usage"]           = combined_usage
    result["raw_metadata"]    = combined_meta
    result["raw_output"]      = raw_output_combined
    result["input_text"]      = text.strip()
    result["prompt_template"] = [
        ("[takeaways] system", _PROMPT_TAKEAWAYS.messages[0].prompt.template), # pyright: ignore[reportAttributeAccessIssue]
        ("[takeaways] human",  _PROMPT_TAKEAWAYS.messages[1].prompt.template), # pyright: ignore[reportAttributeAccessIssue]
        ("[summary] system",   _PROMPT_SUMMARY.messages[0].prompt.template), # pyright: ignore[reportAttributeAccessIssue]
        ("[summary] human",    _PROMPT_SUMMARY.messages[1].prompt.template), # pyright: ignore[reportAttributeAccessIssue]
    ]
    result["prompt_params"] = {
        "language": language,
        "takeaways_detail_guidance": takeaways_detail_guidance,
        "summary_detail_guidance": summary_detail_guidance,
    }
    return result
