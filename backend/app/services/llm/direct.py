"""Direct summarization strategy — extractor + abstractor in one LLM call."""

import html

import structlog

from ...schemas.context_expansion import RelatedSource
from ...schemas.summary import LlmSummaryRequest, LlmSummaryResult
from ._base import (
    SummaryOutput,
    build_detail_guidance,
    build_language_instruction,
    build_structured_llm,
    parse_structured_output,
    prompt_texts,
)
from ._prompts import DIRECT_WITH_RELATED_SOURCES, EXTRACT_FROM_CONTENT

log = structlog.get_logger(__name__)


def _neutralize_block_tags(text: str) -> str:
    """A source quoting the delimiter must not be able to close its block and speak outside it."""
    return text.replace("<related_source", "&lt;related_source").replace(
        "</related_source", "&lt;/related_source"
    )


def _related_source_blocks(related_sources: list[RelatedSource]) -> str:
    return "\n\n".join(
        f'<related_source id="{number}" url="{html.escape(source.url)}">\n'
        f"{_neutralize_block_tags(source.title or '')}\n{_neutralize_block_tags(source.excerpt)}\n"
        "</related_source>"
        for number, source in enumerate(related_sources, start=1)
    )


async def run(request: LlmSummaryRequest) -> LlmSummaryResult:
    llm = build_structured_llm(SummaryOutput, request.model_provider, request.model_name)
    prompt = DIRECT_WITH_RELATED_SOURCES if request.related_sources else EXTRACT_FROM_CONTENT
    chain = prompt | llm

    text = request.text.strip()
    invoke_params = {
        "language_instruction": build_language_instruction(request.language),
        "what_to_generate": "summary",
        "detail_guidance": build_detail_guidance(request.spec, request.length),
        "text": text,
    }
    if request.related_sources:
        invoke_params["text"] = _neutralize_block_tags(text)
        invoke_params["related_sources"] = _related_source_blocks(request.related_sources)

    raw = await chain.ainvoke(invoke_params)
    parsed, raw_str, usage, raw_metadata = parse_structured_output(raw, "direct", "summary")

    return LlmSummaryResult(
        summary=parsed.summary,
        source_url=request.source_url,
        usage=usage,
        raw_metadata=raw_metadata,
        raw_output=raw_str,
        input_text=text,
        prompt_template=prompt_texts(prompt, "summary"),
        prompt_params={k: v for k, v in invoke_params.items() if k != "text"},
    )
