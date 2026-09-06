"""Single-prompt summarization (extractor + abstractor in one call)."""

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


class _SummaryPromptResponse(BaseModel):
    summary: str
    key_takeaways: list[str]


class _SummaryOnlyPromptResponse(BaseModel):
    summary: str


async def run(
    input: dict,
    source_url: str,
    model_name: str,
    model_provider: str,
    language: str,
    skip_takeaways: bool = False,
) -> LlmSummaryResult:
    schema = _SummaryOnlyPromptResponse if skip_takeaways else _SummaryPromptResponse
    what_to_generate = "summary" if skip_takeaways else "summary and key_takeaways"

    guidance_parts = [GENERIC_DETAIL_GUIDANCE, SUMMARY_DETAIL_GUIDANCE]
    if not skip_takeaways:
        guidance_parts.append(TAKEAWAY_DETAIL_GUIDANCE)

    llm = build_structured_llm(schema, model_provider, model_name)
    chain = EXTRACT_FROM_CONTENT | llm

    text = input["text"]
    invoke_params = {
        "language": language,
        "what_to_generate": what_to_generate,
        "detail_guidance": "\n".join(guidance_parts),
        "text": text.strip(),
    }

    raw = await chain.ainvoke(invoke_params)
    parsed, raw_str, usage, raw_metadata = parse_structured_output(raw, "simple", "summary")

    return LlmSummaryResult(
        title=input["title"],
        summary=parsed.summary,
        key_takeaways=[] if skip_takeaways else parsed.key_takeaways,
        source_url=source_url,
        usage=usage,
        raw_metadata=raw_metadata,
        raw_output=raw_str,
        input_text=text.strip(),
        prompt_template=prompt_texts(EXTRACT_FROM_CONTENT, "summary"),
        prompt_params={k: v for k, v in invoke_params.items() if k != "text"},
    )
