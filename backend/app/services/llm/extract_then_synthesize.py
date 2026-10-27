"""Extract-then-synthesize strategy — two sequential LLM calls.

Call 1: extract key_takeaways from the raw text.
Call 2: write the final output (summary or bullets, per spec.output_format) using ONLY the
takeaways as input, so the second call synthesizes from already-distilled points.
"""

import structlog

from ...schemas.summary import LlmSummaryRequest, LlmSummaryResult
from ._base import (
    GENERIC_DETAIL_GUIDANCE,
    TAKEAWAY_DETAIL_GUIDANCE,
    BulletsResponse,
    StructuredOutput,
    SummaryOutput,
    build_detail_guidance,
    build_language_instruction,
    build_structured_llm,
    parse_structured_output,
    prompt_texts,
)
from ._prompts import EXTRACT_FROM_CONTENT, SYNTHESIZE_FROM_TAKEAWAYS

log = structlog.get_logger(__name__)


async def _extract_takeaways(request: LlmSummaryRequest, text: str) -> StructuredOutput:
    llm = build_structured_llm(BulletsResponse, request.model_provider, request.model_name)
    raw = await (EXTRACT_FROM_CONTENT | llm).ainvoke(
        {
            "language_instruction": build_language_instruction(request.language),
            "text": text,
            "what_to_generate": "key_takeaways",
            "detail_guidance": "\n".join([GENERIC_DETAIL_GUIDANCE, TAKEAWAY_DETAIL_GUIDANCE]),
        }
    )
    return parse_structured_output(raw, "extract_then_synthesize", "takeaways")


async def _synthesize(
    request: LlmSummaryRequest, key_takeaways: list[str]
) -> tuple[*StructuredOutput, dict[str, str]]:
    llm = build_structured_llm(SummaryOutput, request.model_provider, request.model_name)
    invoke_params = {
        "language_instruction": build_language_instruction(request.language),
        "takeaways": "\n".join(f"- {item}" for item in key_takeaways),
        "detail_guidance": build_detail_guidance(request.spec, request.length),
    }
    raw = await (SYNTHESIZE_FROM_TAKEAWAYS | llm).ainvoke(invoke_params)
    parsed, raw_str, usage, raw_metadata = parse_structured_output(
        raw, "extract_then_synthesize", "synthesis"
    )
    prompt_params = {k: v for k, v in invoke_params.items() if k != "takeaways"}
    return parsed, raw_str, usage, raw_metadata, prompt_params


async def run(request: LlmSummaryRequest) -> LlmSummaryResult:
    text = request.text.strip()
    takeaways, takeaways_raw, takeaways_usage, takeaways_metadata = await _extract_takeaways(
        request, text
    )
    parsed, raw_str, usage, raw_metadata, prompt_params = await _synthesize(
        request, takeaways.key_takeaways
    )

    return LlmSummaryResult(
        summary=parsed.summary,
        source_url=request.source_url,
        usage=takeaways_usage + usage,
        raw_metadata={"takeaways": takeaways_metadata, "synthesis": raw_metadata},
        raw_output=f"--- takeaways ---\n{takeaways_raw}\n--- synthesis ---\n{raw_str}",
        input_text=text,
        prompt_template=[
            *prompt_texts(EXTRACT_FROM_CONTENT, "takeaways"),
            *prompt_texts(SYNTHESIZE_FROM_TAKEAWAYS, "synthesis"),
        ],
        prompt_params=prompt_params,
    )
