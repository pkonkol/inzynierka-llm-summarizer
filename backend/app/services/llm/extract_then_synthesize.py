"""Extract-then-synthesize strategy — two sequential LLM calls.

Call 1: extract key_takeaways from the raw text.
Call 2: write the final output (summary or bullets, per spec.output_format) using ONLY the
takeaways — not the full text — as input. The idea: the second call synthesizes from the
already-distilled points, potentially producing a more coherent and focused result.

Split into _extract_takeaways/_synthesize on purpose: this is the seam a future refinement or
shortening sub-strategy (post-hoc revision against the length target) plugs into. Not built yet.
"""

import structlog
from pydantic import BaseModel

from ...schemas.summary import LlmSummaryResult, UsageMetadata
from ...schemas.summary_spec import ExplicitLength, SummarySpec
from ._base import (
    GENERIC_DETAIL_GUIDANCE,
    TAKEAWAY_DETAIL_GUIDANCE,
    build_detail_guidance,
    build_language_instruction,
    build_structured_llm,
    parse_structured_output,
    prompt_texts,
)
from ._prompts import EXTRACT_FROM_CONTENT, SYNTHESIZE_FROM_TAKEAWAYS

log = structlog.get_logger(__name__)


class _TakeawaysOnly(BaseModel):
    key_takeaways: list[str]


class _ProseResponse(BaseModel):
    summary: str


class _BulletsResponse(BaseModel):
    key_takeaways: list[str]


class _TakeawaysStage(BaseModel):
    key_takeaways: list[str]
    usage: UsageMetadata
    raw_metadata: dict
    raw_str: str


async def _extract_takeaways(
    input: dict, language: str, model_name: str, model_provider: str
) -> _TakeawaysStage:
    llm = build_structured_llm(_TakeawaysOnly, model_provider, model_name)
    chain = EXTRACT_FROM_CONTENT | llm
    guidance = "\n".join([GENERIC_DETAIL_GUIDANCE, TAKEAWAY_DETAIL_GUIDANCE])

    raw = await chain.ainvoke(
        {
            "language_instruction": build_language_instruction(language),
            "text": input["text"].strip(),
            "what_to_generate": "key_takeaways",
            "detail_guidance": guidance,
        }
    )
    parsed, raw_str, usage, raw_metadata = parse_structured_output(
        raw, "extract_then_synthesize", "takeaways"
    )
    return _TakeawaysStage(
        key_takeaways=parsed.key_takeaways, usage=usage, raw_metadata=raw_metadata, raw_str=raw_str
    )


async def _synthesize(
    takeaways: _TakeawaysStage,
    spec: SummarySpec,
    source_url: str,
    title: str,
    input_text: str,
    language: str,
    model_name: str,
    model_provider: str,
) -> LlmSummaryResult:
    if (
        not isinstance(spec.length, ExplicitLength)
        or spec.length.target_words is None
        or spec.length.target_sentences is None
    ):
        raise ValueError(
            "extract_then_synthesize._synthesize requires a fully resolved ExplicitLength "
            "(target_words and target_sentences both set) — scaled_to_input/match_reference "
            "must be resolved by the caller first, via resolve_target_length"
        )
    target_words = spec.length.target_words
    target_sentences = spec.length.target_sentences

    is_bullets = spec.output_format == "bullets"
    schema = _BulletsResponse if is_bullets else _ProseResponse
    llm = build_structured_llm(schema, model_provider, model_name)
    chain = SYNTHESIZE_FROM_TAKEAWAYS | llm

    invoke_params = {
        "language_instruction": build_language_instruction(language),
        "takeaways": "\n".join(f"- {item}" for item in takeaways.key_takeaways),
        "detail_guidance": build_detail_guidance(spec, target_words, target_sentences),
    }
    raw = await chain.ainvoke(invoke_params)
    parsed, raw_str, usage, raw_metadata = parse_structured_output(
        raw, "extract_then_synthesize", "synthesis"
    )

    return LlmSummaryResult(
        title=title,
        summary=parsed.summary if not is_bullets else None,
        key_takeaways=parsed.key_takeaways if is_bullets else takeaways.key_takeaways,
        output_format=spec.output_format,
        source_url=source_url,
        usage=takeaways.usage + usage,
        raw_metadata={"takeaways": takeaways.raw_metadata, "synthesis": raw_metadata},
        raw_output=f"--- takeaways ---\n{takeaways.raw_str}\n--- synthesis ---\n{raw_str}",
        input_text=input_text,
        prompt_template=[
            *prompt_texts(EXTRACT_FROM_CONTENT, "takeaways"),
            *prompt_texts(SYNTHESIZE_FROM_TAKEAWAYS, "synthesis"),
        ],
        prompt_params={k: v for k, v in invoke_params.items() if k != "takeaways"},
    )


async def run(
    input: dict,
    source_url: str,
    model_name: str,
    model_provider: str,
    language: str,
    spec: SummarySpec,
) -> LlmSummaryResult:
    takeaways = await _extract_takeaways(input, language, model_name, model_provider)
    return await _synthesize(
        takeaways,
        spec,
        source_url,
        input["title"],
        input["text"].strip(),
        language,
        model_name,
        model_provider,
    )
