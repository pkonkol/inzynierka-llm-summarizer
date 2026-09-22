"""Direct summarization strategy — extractor + abstractor in one LLM call."""

import structlog

from ...schemas.summary import LlmSummaryResult
from ...schemas.summary_spec import ResolvedLength, SummarySpec
from ._base import (
    SummaryOutput,
    build_detail_guidance,
    build_language_instruction,
    build_structured_llm,
    parse_structured_output,
    prompt_texts,
)
from ._prompts import EXTRACT_FROM_CONTENT

log = structlog.get_logger(__name__)


async def run(
    input: dict,
    source_url: str,
    model_name: str,
    model_provider: str,
    language: str,
    spec: SummarySpec,
    length: ResolvedLength,
) -> LlmSummaryResult:
    llm = build_structured_llm(SummaryOutput, model_provider, model_name)
    chain = EXTRACT_FROM_CONTENT | llm

    text = input["text"].strip()
    invoke_params = {
        "language_instruction": build_language_instruction(language),
        "what_to_generate": "summary",
        "detail_guidance": build_detail_guidance(spec, length),
        "text": text,
    }

    raw = await chain.ainvoke(invoke_params)
    parsed, raw_str, usage, raw_metadata = parse_structured_output(raw, "direct", "summary")

    return LlmSummaryResult(
        summary=parsed.summary,
        source_url=source_url,
        usage=usage,
        raw_metadata=raw_metadata,
        raw_output=raw_str,
        input_text=text,
        prompt_template=prompt_texts(EXTRACT_FROM_CONTENT, "summary"),
        prompt_params={k: v for k, v in invoke_params.items() if k != "text"},
    )
