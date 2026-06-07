import json
import logging
from typing import Any

from google import genai

from ..core.config import settings
from ..schemas.schemas import UsageMetadata
from ..schemas.summary import SummaryResponse

logger = logging.getLogger(__name__)


def _get_genai() -> genai.Client:
    api_key = settings.gemini_api_key
    if not api_key:
        raise ValueError("Missing Gemini API key. Set GEMINI_API_KEY in backend/.env.")
    return genai.Client(api_key=api_key)


def _build_detail_guidance(text: str) -> str:
    n = len(text)
    if n < 3000:
        return "Write a compact summary with 3-4 key takeaways."
    if n < 9000:
        return "Write a medium-depth summary with 5-7 specific key takeaways."
    return "Write a detailed summary with 8-12 concrete key takeaways and nuanced context."


def _generate_content(prompt: str, target_tokens: int, model_name: str, model_provider: str):
    if model_provider.lower() not in settings.supported_models:
        raise ValueError(f"Unsupported model provider: {model_provider}")
    if model_name.lower() not in [m.lower() for m in settings.supported_models.get(model_provider.lower(), [])]:
        raise ValueError(f"Unsupported model name: {model_name} for provider {model_provider}")

    if model_provider.lower() == "gemini":
        client = _get_genai()
        return client.models.generate_content(
            model=model_name,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": SummaryResponse,
                "max_output_tokens": target_tokens,
            },
        )
    raise NotImplementedError(f"Provider {model_provider} is not implemented yet")


def _extract_usage(usage_meta) -> UsageMetadata:
    if usage_meta is None:
        return UsageMetadata()
    return UsageMetadata(
        input_tokens=getattr(usage_meta, "prompt_token_count", None) or 0,
        output_tokens=getattr(usage_meta, "candidates_token_count", None) or 0,
        thinking_tokens=getattr(usage_meta, "thoughts_token_count", None) or 0,
        total_tokens=getattr(usage_meta, "total_token_count", None) or 0,
    )


def generate_summary(text: str, source_url: str, model_name: str, model_provider: str, language: str) -> dict[str, Any]:
    if not text or not text.strip():
        raise ValueError("Input text cannot be empty")

    target_tokens = settings.summary_max_output_tokens
    lang_instruction = f"Write the entire summary in language code: {language}.\n"
    prompt = (
        "Summarize the provided web content. Return high-signal output in the requested JSON schema. "
        "Adapt detail level to article length. "
        f"{_build_detail_guidance(text)}\n"
        f"{lang_instruction}"
        "Format key_takeaways as a markdown bullet list with one takeaway per line. "
        "Do not compress the takeaways into a single paragraph or numbered block. "
        "Ensure key_takeaways is content-rich and specific, not generic.\n\n"
        f"{'Source URL: ' + source_url + chr(10) if source_url else ''}"
        f"Content:\n{text.strip()}"
    )

    logger.debug("LLM: model=%s:%s text_chars=%s target_tokens=%s", model_provider, model_name, len(text), target_tokens)

    response = _generate_content(prompt, target_tokens, model_name, model_provider)
    usage = _extract_usage(getattr(response, "usage_metadata", None))

    logger.info(
        "LLM: model=%s:%s finish_reason=%s input=%s output=%s thinking=%s",
        model_provider, model_name,
        response.candidates[0].finish_reason if response.candidates else None,
        usage.input_tokens, usage.output_tokens, usage.thinking_tokens,
    )

    parsed = response.parsed
    if parsed is not None:
        summary = parsed if isinstance(parsed, SummaryResponse) else SummaryResponse.model_validate(parsed)
    else:
        raw = response.text
        if not raw:
            raise ValueError("Gemini returned empty response payload")
        try:
            summary = SummaryResponse.model_validate(json.loads(raw))
        except (TypeError, json.JSONDecodeError) as exc:
            raise ValueError("Gemini returned invalid JSON response") from exc

    result = summary.model_dump()
    if source_url:
        result["source_url"] = source_url
    result["usage"] = usage.model_dump()
    return result