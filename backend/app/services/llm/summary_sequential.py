"""Sequential summarization — two independent LLM calls.

Call 1: extract key_takeaways from raw text.
Call 2: write summary from raw text (independently).

Both calls run concurrently (asyncio.gather). The two usages are summed.
"""

import asyncio

import structlog
from pydantic import BaseModel

from ...schemas.summary import LlmSummaryResult
from ._base import (
    GENERIC_DETAIL_GUIDANCE,
    SUMMARY_DETAIL_GUIDANCE,
    TAKEAWAY_DETAIL_GUIDANCE,
    build_structured_llm,
    parse_structured_output,
    prompt_texts,
)
from ._prompts import EXTRACT_FROM_CONTENT

log = structlog.get_logger(__name__)


class _TakeawaysOnly(BaseModel):
    key_takeaways: list[str]


class _SummaryOnly(BaseModel):
    summary: str


async def run(
    input: dict,
    source_url: str,
    model_name: str,
    model_provider: str,
    language: str,
    skip_takeaways: bool = False,
) -> LlmSummaryResult:
    summary_llm = build_structured_llm(_SummaryOnly, model_provider, model_name)
    chain_summary = EXTRACT_FROM_CONTENT | summary_llm

    text = input["text"]
    summary_guidance = "\n".join([GENERIC_DETAIL_GUIDANCE, SUMMARY_DETAIL_GUIDANCE])
    summary_params = {
        "language": language,
        "text": text.strip(),
        "what_to_generate": "summary",
        "detail_guidance": summary_guidance,
    }

    if skip_takeaways:
        raw_sm = await chain_summary.ainvoke(summary_params)
        parsed_sm, raw_str_sm, usage_sm, meta_sm = parse_structured_output(
            raw_sm, "sequential", "summary"
        )
        return LlmSummaryResult(
            title=input["title"],
            summary=parsed_sm.summary,
            key_takeaways=[],
            source_url=source_url,
            usage=usage_sm,
            raw_metadata={"summary": meta_sm},
            raw_output=raw_str_sm,
            input_text=text.strip(),
            prompt_template=prompt_texts(EXTRACT_FROM_CONTENT, "summary"),
            prompt_params={"language": language, "summary_detail_guidance": summary_guidance},
        )

    takeaway_llm = build_structured_llm(_TakeawaysOnly, model_provider, model_name)
    chain_takeaways = EXTRACT_FROM_CONTENT | takeaway_llm
    takeaways_guidance = "\n".join([GENERIC_DETAIL_GUIDANCE, TAKEAWAY_DETAIL_GUIDANCE])
    takeaways_params = {
        "language": language,
        "text": text.strip(),
        "what_to_generate": "key_takeaways",
        "detail_guidance": takeaways_guidance,
    }

    raw_tk, raw_sm = await asyncio.gather(
        chain_takeaways.ainvoke(takeaways_params),
        chain_summary.ainvoke(summary_params),
    )
    parsed_tk, raw_str_tk, usage_tk, meta_tk = parse_structured_output(
        raw_tk, "sequential", "takeaways"
    )
    parsed_sm, raw_str_sm, usage_sm, meta_sm = parse_structured_output(
        raw_sm, "sequential", "summary"
    )

    return LlmSummaryResult(
        title=input["title"],
        summary=parsed_sm.summary,
        key_takeaways=parsed_tk.key_takeaways,
        source_url=source_url,
        usage=usage_tk + usage_sm,
        raw_metadata={"takeaways": meta_tk, "summary": meta_sm},
        raw_output=f"--- takeaways ---\n{raw_str_tk}\n--- summary ---\n{raw_str_sm}",
        input_text=text.strip(),
        prompt_template=[
            *prompt_texts(EXTRACT_FROM_CONTENT, "takeaways"),
            *prompt_texts(EXTRACT_FROM_CONTENT, "summary"),
        ],
        prompt_params={
            "language": language,
            "takeaways_detail_guidance": takeaways_guidance,
            "summary_detail_guidance": summary_guidance,
        },
    )
