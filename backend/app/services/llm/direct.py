"""Direct summarization strategy — extractor + abstractor in one LLM call."""

import html

import structlog

from ...schemas.context_expansion import RelatedSource
from ...schemas.summary import LlmSummaryRequest, LlmSummaryResult
from ...schemas.summary_spec import ContextSection
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


_INTEGRATED_CONTEXT_USE = (
    "The related sources add context: use them only where they support, extend or contradict the "
    "content, and mark every fact taken from them with the source number in brackets, e.g. [1]. "
    "The content stays the main subject."
)

_SECTION_FOCUS = {
    "supplement": (
        "what other sources add",
        "report what the related sources add: facts, background or perspectives the content lacks",
    ),
    "assessment": (
        "how other sources assess the content",
        "go through the key claims of the content and say for each whether the related sources "
        "confirm it, contradict it, qualify it or show it as simplified; attribute every judgement "
        "to its source (e.g. 'according to [2], ...') and judge no further than the sources do",
    ),
}


def _section_context_use(section: ContextSection) -> str:
    heading, focus = _SECTION_FOCUS[section.stance]
    return (
        "Write the summary from the content alone, without using or citing the related sources; "
        "the length requirements below apply to it. After the summary, add a markdown section "
        f"with a level-2 heading meaning '{heading}', written in the output language. In that "
        f"section, in about {section.target_words} words, {focus}. Mark every statement taken "
        "from a related source with its number in brackets, e.g. [1]."
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
        section = request.spec.context_section
        invoke_params["context_use"] = (
            _INTEGRATED_CONTEXT_USE if section is None else _section_context_use(section)
        )

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
