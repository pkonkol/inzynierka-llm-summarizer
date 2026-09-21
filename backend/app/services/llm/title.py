"""Title generation — its own prompt, its own model call.

The prompt lives here instead of in _prompts.py so that nothing it does can reach the
research prompts the summarization strategies share.
"""

import structlog
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel

from ...core.config import settings
from ._base import (
    LlmOutputError,
    build_language_instruction,
    build_structured_llm,
    parse_structured_output,
)

log = structlog.get_logger(__name__)

_MAX_TITLE_CHARS = 200
# A title is decided by the opening, so the rest of the article is paid-for context nobody reads.
_TITLE_INPUT_CHARS = 4000


class TitleResponse(BaseModel):
    title: str


_TITLE_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You write short, factual titles for articles. {language_instruction} "
            "Return only valid JSON matching the requested schema.",
        ),
        (
            "human",
            "Write a title of at most 12 words naming what this content is about. "
            "Use no quotation marks and no trailing punctuation."
            "\n\nContent:\n{text}",
        ),
    ]
)


async def generate_title(text: str, language: str) -> str:
    model_provider = settings.title_model["model_provider"]
    model_name = settings.title_model["model_name"]
    log.debug(
        "generating title",
        provider=model_provider,
        model=model_name,
        input_chars=len(text),
    )

    llm = build_structured_llm(TitleResponse, model_provider, model_name)
    raw = await (_TITLE_PROMPT | llm).ainvoke(
        {
            "language_instruction": build_language_instruction(language),
            "text": text[:_TITLE_INPUT_CHARS],
        }
    )
    parsed, raw_str, usage, _ = parse_structured_output(raw, "title", "title")

    title = parsed.title.strip()[:_MAX_TITLE_CHARS]
    if not title:
        raise LlmOutputError("title model returned a blank title", raw_output=raw_str)

    log.info(
        "title generated",
        provider=model_provider,
        model=model_name,
        token_usage=usage.total_tokens,
    )
    return title
