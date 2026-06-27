"""Cascade summarization — two sequential LLM calls.

Call 1: extract key_takeaways from raw text.
Call 2: write title + short_summary using ONLY the takeaways (not the full text).

The idea: the second call synthesises from the already-distilled points,
potentially producing a more coherent and focused summary.
"""
import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel

from ...schemas.summary import SummaryResponse
from ._base import build_detail_guidance, build_llm, extract_usage, raw_output_str

logger = logging.getLogger(__name__)


class _TakeawaysOnly(BaseModel):
    key_takeaways: str


class _SummaryOnly(BaseModel):
    title: str
    short_summary: str


_PROMPT_TAKEAWAYS = ChatPromptTemplate.from_messages([
    ("system",
     "You are an expert analyst. Write the entire output in language code: {language}. "
     "Return only valid JSON matching the requested schema."),
    ("human",
     "Extract the most important points from the following web content. {detail_guidance}\n"
     "Format key_takeaways as a markdown bullet list, one point per line. "
     "Be specific and content-rich — avoid generic statements.\n\n"
     "Source URL: {source_url}\n"
     "Content:\n{text}"),
])

_PROMPT_SYNTHESIS = ChatPromptTemplate.from_messages([
    ("system",
     "You are an expert editor. Write the entire output in language code: {language}. "
     "Return only valid JSON matching the requested schema."),
    ("human",
     "Based ONLY on the key points below, write a concise title and a short prose summary.\n"
     "The summary should be 2-4 sentences synthesising the core argument.\n"
     "Do NOT introduce information not present in the key points.\n\n"
     "Source URL: {source_url}\n"
     "Key points:\n{takeaways}"),
])


async def run(
    text: str, source_url: str, model_name: str, model_provider: str, language: str
) -> dict[str, Any]:
    """Two sequential calls: takeaways → synthesis. Returns full result dict."""
    llm = build_llm(model_provider, model_name)
    chain_takeaways = _PROMPT_TAKEAWAYS | llm.with_structured_output(_TakeawaysOnly, include_raw=True)
    chain_synthesis = _PROMPT_SYNTHESIS | llm.with_structured_output(_SummaryOnly,   include_raw=True)

    detail_guidance = build_detail_guidance(text)
    params_1 = {
        "language": language,
        "detail_guidance": detail_guidance,
        "source_url": source_url or "",
        "text": text.strip(),
    }

    # --- call 1: extract takeaways ---
    raw_tk: dict[str, Any] | BaseModel = await chain_takeaways.ainvoke(params_1)
    if isinstance(raw_tk, BaseModel):
        raw_tk = raw_tk.model_dump()

    raw_str_tk = raw_output_str(raw_tk)
    parsed_tk: _TakeawaysOnly | None = raw_tk.get("parsed")
    if parsed_tk is None:
        err = ValueError("[cascade] model returned unparseable takeaways response")
        err.raw_output = raw_str_tk  # type: ignore[attr-defined]
        raise err

    # --- call 2: synthesise from takeaways only ---
    params_2 = {
        "language": language,
        "source_url": source_url or "",
        "takeaways": parsed_tk.key_takeaways,
    }
    raw_sm: dict[str, Any] | BaseModel = await chain_synthesis.ainvoke(params_2)
    if isinstance(raw_sm, BaseModel):
        raw_sm = raw_sm.model_dump()

    raw_str_sm = raw_output_str(raw_sm)
    parsed_sm: _SummaryOnly | None = raw_sm.get("parsed")
    if parsed_sm is None:
        err = ValueError("[cascade] model returned unparseable synthesis response")
        err.raw_output = f"--- takeaways ---\n{raw_str_tk}\n--- synthesis ---\n{raw_str_sm}"  # type: ignore[attr-defined]
        raise err

    usage_tk, meta_tk = extract_usage(raw_tk.get("raw"))
    usage_sm, meta_sm = extract_usage(raw_sm.get("raw"))

    combined_usage = {
        "input_tokens":    usage_tk.input_tokens   + usage_sm.input_tokens,
        "output_tokens":   usage_tk.output_tokens  + usage_sm.output_tokens,
        "thinking_tokens": usage_tk.thinking_tokens + usage_sm.thinking_tokens,
        "total_tokens":    usage_tk.total_tokens   + usage_sm.total_tokens,
    }
    raw_output_combined = f"--- takeaways ---\n{raw_str_tk}\n--- synthesis ---\n{raw_str_sm}"

    result = SummaryResponse(
        title=parsed_sm.title,
        short_summary=parsed_sm.short_summary,
        key_takeaways=parsed_tk.key_takeaways,
        source_url=source_url or "",
    ).model_dump()

    result["usage"]           = combined_usage
    result["raw_metadata"]    = {"takeaways": meta_tk, "synthesis": meta_sm}
    result["raw_output"]      = raw_output_combined
    result["input_text"]      = text.strip()
    result["prompt_template"] = [
        ("[takeaways] system",  _PROMPT_TAKEAWAYS.messages[0].prompt.template),
        ("[takeaways] human",   _PROMPT_TAKEAWAYS.messages[1].prompt.template),
        ("[synthesis] system",  _PROMPT_SYNTHESIS.messages[0].prompt.template),
        ("[synthesis] human",   _PROMPT_SYNTHESIS.messages[1].prompt.template),
    ]
    result["prompt_params"] = {k: v for k, v in params_1.items() if k != "text"}
    return result
