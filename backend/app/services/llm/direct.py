"""Direct summarization strategy — extractor + abstractor in one LLM call."""

import structlog
from pydantic import BaseModel

from ...schemas.summary import LlmSummaryResult
from ...schemas.summary_spec import ExplicitLength, SummarySpec
from ._base import (
    build_detail_guidance,
    build_language_instruction,
    build_structured_llm,
    parse_structured_output,
    prompt_texts,
)
from ._prompts import EXTRACT_FROM_CONTENT

log = structlog.get_logger(__name__)


class _ProseResponse(BaseModel):
    summary: str


class _BulletsResponse(BaseModel):
    key_takeaways: list[str]


async def run(
    input: dict,
    source_url: str,
    model_name: str,
    model_provider: str,
    language: str,
    spec: SummarySpec,
) -> LlmSummaryResult:
    if (
        not isinstance(spec.length, ExplicitLength)
        or spec.length.target_words is None
        or spec.length.target_sentences is None
    ):
        raise ValueError(
            "direct.run requires spec.length to be a fully resolved ExplicitLength (target_words "
            "and target_sentences both set) — scaled_to_input/match_reference must be resolved "
            "by the caller first, via resolve_target_length"
        )
    target_words = spec.length.target_words
    target_sentences = spec.length.target_sentences

    is_bullets = spec.output_format == "bullets"
    schema = _BulletsResponse if is_bullets else _ProseResponse
    what_to_generate = "key_takeaways" if is_bullets else "summary"

    llm = build_structured_llm(schema, model_provider, model_name)
    chain = EXTRACT_FROM_CONTENT | llm

    text = input["text"]
    invoke_params = {
        "language_instruction": build_language_instruction(language),
        "what_to_generate": what_to_generate,
        "detail_guidance": build_detail_guidance(spec, target_words, target_sentences),
        "text": text.strip(),
    }

    raw = await chain.ainvoke(invoke_params)
    parsed, raw_str, usage, raw_metadata = parse_structured_output(raw, "direct", what_to_generate)

    return LlmSummaryResult(
        title=input["title"],
        summary=parsed.summary if not is_bullets else None,
        key_takeaways=parsed.key_takeaways if is_bullets else None,
        output_format=spec.output_format,
        source_url=source_url,
        usage=usage,
        raw_metadata=raw_metadata,
        raw_output=raw_str,
        input_text=text.strip(),
        prompt_template=prompt_texts(EXTRACT_FROM_CONTENT, what_to_generate),
        prompt_params={k: v for k, v in invoke_params.items() if k != "text"},
    )
