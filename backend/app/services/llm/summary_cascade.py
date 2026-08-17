"""Cascade summarization — two sequential LLM calls.

Call 1: extract key_takeaways from raw text.
Call 2: write summary using ONLY the takeaways (not the full text).

The idea: the second call synthesises from the already-distilled points,
potentially producing a more coherent and focused summary.
"""

import structlog
from pydantic import BaseModel

from ...schemas.summary import LlmSummaryResult
from ._base import (
    build_generic_detail_guidance,
    build_structured_llm,
    build_summary_detail_guidance,
    build_takeaway_detail_guidance,
    parse_structured_output,
    prompt_texts,
)
from ._prompts import EXTRACT_FROM_CONTENT, SYNTHESIZE_FROM_TAKEAWAYS

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
    # skip_takeaways discards the result only — call 2 is built from call 1's output, so the
    # first call always has to happen regardless of the flag.
    takeaway_llm = build_structured_llm(_TakeawaysOnly, model_provider, model_name)
    summary_llm = build_structured_llm(_SummaryOnly, model_provider, model_name)
    chain_takeaways = EXTRACT_FROM_CONTENT | takeaway_llm
    chain_synthesis = SYNTHESIZE_FROM_TAKEAWAYS | summary_llm

    text = input["text"]
    takeaways_guidance = "\n".join(
        [build_generic_detail_guidance(), build_takeaway_detail_guidance()]
    )
    summary_guidance = "\n".join([build_generic_detail_guidance(), build_summary_detail_guidance()])

    raw_tk = await chain_takeaways.ainvoke(
        {
            "language": language,
            "text": text.strip(),
            "what_to_generate": "key_takeaways",
            "detail_guidance": takeaways_guidance,
        }
    )
    parsed_tk, raw_str_tk, usage_tk, meta_tk = parse_structured_output(
        raw_tk, "cascade", "takeaways"
    )

    raw_sm = await chain_synthesis.ainvoke(
        {
            "language": language,
            "takeaways": "\n".join(f"- {item}" for item in parsed_tk.key_takeaways),
            "detail_guidance": summary_guidance,
        }
    )
    parsed_sm, raw_str_sm, usage_sm, meta_sm = parse_structured_output(
        raw_sm, "cascade", "synthesis"
    )

    return LlmSummaryResult(
        title=input["title"],
        summary=parsed_sm.summary,
        key_takeaways=[] if skip_takeaways else parsed_tk.key_takeaways,
        source_url=source_url,
        usage=usage_tk + usage_sm,
        raw_metadata={"takeaways": meta_tk, "synthesis": meta_sm},
        raw_output=f"--- takeaways ---\n{raw_str_tk}\n--- synthesis ---\n{raw_str_sm}",
        input_text=text.strip(),
        prompt_template=[
            *prompt_texts(EXTRACT_FROM_CONTENT, "takeaways"),
            *prompt_texts(SYNTHESIZE_FROM_TAKEAWAYS, "synthesis"),
        ],
        prompt_params={
            "language": language,
            "takeaways_detail_guidance": takeaways_guidance,
            "summary_detail_guidance": summary_guidance,
        },
    )
