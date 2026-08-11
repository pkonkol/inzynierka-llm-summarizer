"""Single-prompt summarization (extractor + abstractor in one call)."""
import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel

from ...schemas.summary import LlmSummaryResult
from ._base import (
    LlmOutputError,
    build_generic_detail_guidance,
    build_structured_llm,
    build_summary_detail_guidance,
    build_takeaway_detail_guidance,
    extract_usage,
    raw_output_str,
)

logger = logging.getLogger(__name__)

class _SummaryPromptResponse(BaseModel):
    summary: str
    key_takeaways: list[str]

_PROMPT_MESSAGES = [
    ("system",
     "You are an expert summarizer. Write the entire output in language code: {language}. "
     "Return only valid JSON matching the requested schema."),
    ("human",
    "Generate summary and key_takeaways from the content. {detail_guidance}\n\n"
     "Content:\n{text}"),
]

_PROMPT = ChatPromptTemplate.from_messages(_PROMPT_MESSAGES)


async def run(
    input: dict, source_url: str, model_name: str, model_provider: str, language: str
) -> LlmSummaryResult:
    """Single-call summarization."""
    llm = build_structured_llm(_SummaryPromptResponse, model_provider, model_name)
    chain = _PROMPT | llm

    text = input["text"]

    detail_guidance = "\n".join(
        [
            build_generic_detail_guidance(),
            build_summary_detail_guidance(),
            build_takeaway_detail_guidance(),
        ]
    )
    invoke_params = {
        "language": language,
        "detail_guidance": detail_guidance,
        "text": text.strip(),
    }

    raw_invoke_output: dict[str, Any] | BaseModel = await chain.ainvoke(invoke_params)

    if isinstance(raw_invoke_output, BaseModel):
        raw_invoke_output = raw_invoke_output.model_dump()

    raw_content_str = raw_output_str(raw_invoke_output)
    logger.debug("[simple] raw output:\n%s", raw_content_str)

    parsed: _SummaryPromptResponse | None = raw_invoke_output.get("parsed")
    if parsed is None:
        raise LlmOutputError(
            f"Model {model_provider}:{model_name} returned empty/unparseable response.",
            raw_output=raw_content_str,
        )

    usage, raw_metadata = extract_usage(raw_invoke_output.get("raw"))

    return LlmSummaryResult(
        title=input["title"],
        summary=parsed.summary,
        key_takeaways=parsed.key_takeaways,
        source_url=source_url,
        usage=usage,
        raw_metadata=raw_metadata,
        raw_output=raw_content_str,
        input_text=text.strip(),
        prompt_template=list(_PROMPT_MESSAGES),
        prompt_params={k: v for k, v in invoke_params.items() if k != "text"},
    )
