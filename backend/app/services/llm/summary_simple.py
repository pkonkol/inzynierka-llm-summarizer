"""Single-prompt summarization (extractor + abstractor in one call)."""
import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel

from ...schemas.summary import SummaryResponse
from ._base import (
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
    trafilatura: dict, source_url: str, model_name: str, model_provider: str, language: str
) -> dict[str, Any]:
    """Single-call summarization. Returns full result dict."""
    llm = build_structured_llm(_SummaryPromptResponse, model_provider, model_name)
    chain = _PROMPT | llm

    text = trafilatura["text"]

    detail_guidance = "\n".join(
        [
            build_generic_detail_guidance(text),
            build_summary_detail_guidance(text),
            build_takeaway_detail_guidance(text),
        ]
    )
    invoke_params = {
        "language": language,
        "detail_guidance": detail_guidance,
        "text": text.strip(),
    }

    # from pydantic import ValidationError
    # try:
    raw_invoke_output: dict[str, Any] | BaseModel = await chain.ainvoke(invoke_params)
    logger.debug("raw invoke struct:\n%s", f"{raw_invoke_output=}")
    logger.debug("raw invoke dir: %s\n", dir(raw_invoke_output))
    # except ValidationError as e:
    #     logger.error("Failed to invoke chain: %s", str(e))
    #     from pprint import pprint
    #     pprint(e)
    #     raise

    if isinstance(raw_invoke_output, BaseModel):
        raw_invoke_output = raw_invoke_output.model_dump()

    raw_content_str = raw_output_str(raw_invoke_output)
    logger.debug("[simple] raw output:\n%s", raw_content_str)

    parsed: SummaryResponse | None = raw_invoke_output.get("parsed")
    if parsed is None:
        err = ValueError(
            f"Model {model_provider}:{model_name} returned empty/unparseable response."
        )
        err.raw_output = raw_content_str  # type: ignore[attr-defined]
        raise err

    ai_message = raw_invoke_output.get("raw")
    usage, raw_metadata = extract_usage(ai_message)

    result = parsed.model_dump()

    result["author"] = trafilatura["author"]
    result["title"] = trafilatura["title"]
    result["source_url"] = source_url
    result["usage"] = usage.model_dump()
    result["raw_metadata"] = raw_metadata
    result["raw_output"] = raw_content_str
    result["input_text"] = text.strip()
    result["prompt_template"] = list(_PROMPT_MESSAGES)
    result["prompt_params"] = {k: v for k, v in invoke_params.items() if k != "text"}
    return result
