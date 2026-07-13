"""Sequential summarization — two independent LLM calls.

Call 1: extract key_takeaways from raw text.
Call 2: write title + short_summary from raw text (independently).

Both calls run concurrently (asyncio.gather). The two usages are summed.
"""
import asyncio
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
    short_summary: str


_PROMPT_TAKEAWAYS = ChatPromptTemplate.from_messages([
    ("system",
     "You are an expert analyst. Write the entire output in language code: {language}. "
     "Return only valid JSON matching the requested schema."),
    ("human",
     "Extract the most important points from the following content. {detail_guidance}\n"
     "Format key_takeaways as a markdown bullet list, one point per line. "
     "Be specific and content-rich — avoid generic statements.\n\n"
     "Content:\n{text}"),
])

_PROMPT_SUMMARY = ChatPromptTemplate.from_messages([
    ("system",
     "You are an expert summarizer. Write the entire output in language code: {language}. "
     "Return only valid JSON matching the requested schema."),
    ("human",
     "Write a concise title and a short prose summary for the following content.\n"
     "The summary should be 2-4 sentences, capturing the core argument or findings.\n\n"
     "Content:\n{text}"),
])


async def run(
    trafilatura: dict, source_url: str, model_name: str, model_provider: str, language: str
) -> dict[str, Any]:
    """Two independent calls run concurrently. Returns merged full result dict."""
    llm = build_llm(model_provider, model_name)
    chain_takeaways = _PROMPT_TAKEAWAYS | llm.with_structured_output(_TakeawaysOnly, include_raw=True)
    chain_summary   = _PROMPT_SUMMARY   | llm.with_structured_output(_SummaryOnly,   include_raw=True)

    text = trafilatura["text"]

    detail_guidance = build_detail_guidance(text)
    base_params = {
        "language": language,
        "detail_guidance": detail_guidance,
        "text": text.strip(),
    }

    (raw_tk, raw_sm) = await asyncio.gather(
        chain_takeaways.ainvoke(base_params),
        chain_summary.ainvoke(base_params),
    )

    def _unwrap(raw: Any) -> dict[str, Any]:
        if isinstance(raw, BaseModel):
            return raw.model_dump()
        return raw

    raw_tk, raw_sm = _unwrap(raw_tk), _unwrap(raw_sm)

    raw_str_tk = raw_output_str(raw_tk)
    raw_str_sm = raw_output_str(raw_sm)

    parsed_tk: _TakeawaysOnly | None = raw_tk.get("parsed")
    parsed_sm: _SummaryOnly   | None = raw_sm.get("parsed")

    if parsed_tk is None or parsed_sm is None:
        missing = "takeaways" if parsed_tk is None else "summary"
        err = ValueError(f"[sequential] model returned unparseable {missing} response")
        err.raw_output = f"--- takeaways ---\n{raw_str_tk}\n--- summary ---\n{raw_str_sm}"  # type: ignore[attr-defined]
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
        short_summary=parsed_sm.short_summary,
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
        ("[takeaways] system", _PROMPT_TAKEAWAYS.messages[0].prompt.template),
        ("[takeaways] human",  _PROMPT_TAKEAWAYS.messages[1].prompt.template),
        ("[summary] system",   _PROMPT_SUMMARY.messages[0].prompt.template),
        ("[summary] human",    _PROMPT_SUMMARY.messages[1].prompt.template),
    ]
    result["prompt_params"] = {k: v for k, v in base_params.items() if k != "text"}
    return result
