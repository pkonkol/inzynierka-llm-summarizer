import json
import logging
import pprint
from typing import Any

from google import genai

from ..core.config import settings
from ..schemas.summary import SummaryResponse


_GEMINI_MODEL = settings.gemini_model
logger = logging.getLogger(__name__)


def _get_client() -> genai.Client:
    api_key = settings.gemini_api_key or settings.google_api_key
    if not api_key:
        raise ValueError(
            "Missing Gemini API key. Set GEMINI_API_KEY or GOOGLE_API_KEY in backend/.env."
        )
    return genai.Client(api_key=api_key)


def _get_target_output_tokens(text: str) -> int:
    text_len = len(text)
    dynamic = settings.summary_base_output_tokens + (
        (text_len // 1000) * settings.summary_tokens_per_1000_chars
    )
    return min(dynamic, settings.summary_max_output_tokens)


def _build_detail_guidance(text: str) -> str:
    text_len = len(text)
    if text_len < 3000:
        return "Write a compact summary with 3-4 key takeaways."
    if text_len < 9000:
        return "Write a medium-depth summary with 5-7 specific key takeaways."
    return "Write a detailed summary with 8-12 concrete key takeaways and nuanced context."


def generate_summary(text: str, source_url: str | None = None) -> dict[str, Any]:
    if not text or not text.strip():
        raise ValueError("Input text cannot be empty")

    target_tokens = _get_target_output_tokens(text)
    detail_guidance = _build_detail_guidance(text)
    source_line = f"Source URL: {source_url}\n" if source_url else ""
    prompt = (
        "Summarize the provided web content. Return high-signal output in the requested JSON schema. "
        "Adapt detail level to article length. "
        f"{detail_guidance}\n"
        "Format key_takeaways as a markdown bullet list with one takeaway per line. "
        "Do not compress the takeaways into a single paragraph or numbered block. "
        "Ensure key_takeaways is content-rich and specific, not generic.\n\n"
        f"{source_line}"
        f"Content:\n{text.strip()}"
    )

    logger.debug(
        "LLM: model=%s text_chars=%s target_tokens=%s",
        _GEMINI_MODEL,
        len(text),
        target_tokens,
    )

    client = _get_client()
    response = client.models.generate_content(
        model=_GEMINI_MODEL,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_schema": SummaryResponse,
            "max_output_tokens": target_tokens,
        },
    )

    logger.info(
        "LLM: model=%s raw response=%s",
        _GEMINI_MODEL,
        response
    )

    pprint.pprint("raw gemini response:")
    pprint.pprint(response)
    pprint.pprint(response.text)
    print("\n\n")

    if response.parsed is not None:
        if isinstance(response.parsed, SummaryResponse):
            result = response.parsed.model_dump()
            if source_url:
                result["source_url"] = source_url
            return result

        result = SummaryResponse.model_validate(response.parsed).model_dump()
        if source_url:
            result["source_url"] = source_url
        return result

    raw_text = response.text
    if not raw_text:
        raise ValueError("Gemini returned empty response payload")

    try:
        payload = json.loads(raw_text)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Gemini returned invalid JSON response") from exc

    result = SummaryResponse.model_validate(payload).model_dump()
    if source_url:
        result["source_url"] = source_url

    logger.debug(
        "LLM: response parsed title_len=%s summary_len=%s",
        len(result.get("title", "")),
        len(result.get("short_summary", "")),
    )

    return result
