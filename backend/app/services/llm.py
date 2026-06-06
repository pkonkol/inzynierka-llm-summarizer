import json
import logging
import pprint
from typing import Any

from google import genai

from ..core.config import settings
from ..schemas.summary import SummaryResponse


logger = logging.getLogger(__name__)


def _get_genai() -> genai.Client:
    api_key = settings.gemini_api_key
    if not api_key:
        raise ValueError(
            "Missing Gemini API key. Set GEMINI_API_KEY in backend/.env."
        )
    return genai.Client(api_key=api_key)


def _get_target_output_tokens(text: str) -> int:
    # text_len = len(text)
    # dynamic = settings.summary_base_output_tokens + (
    #     (text_len // 1000) * settings.summary_tokens_per_1000_chars
    # )
    return settings.summary_max_output_tokens


def _build_detail_guidance(text: str) -> str:
    text_len = len(text)
    if text_len < 3000:
        return "Write a compact summary with 3-4 key takeaways."
    if text_len < 9000:
        return "Write a medium-depth summary with 5-7 specific key takeaways."
    return "Write a detailed summary with 8-12 concrete key takeaways and nuanced context."

def _generate_content(
    prompt: str,
    target_tokens: int,
    model_name: str,
    model_provider: str,
):
    if model_provider.lower() not in settings.supported_models.keys():
        raise ValueError(f"Unsupported model provider: {model_provider}")
    if model_name.lower() not in [m.lower() for m in settings.supported_models.get(model_provider.lower(), [])]:
        raise ValueError(f"Unsupported model name: {model_name} for provider {model_provider}")

    if model_provider.lower() == "gemini":
        client = _get_genai()
        response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "response_schema": SummaryResponse,
                    "max_output_tokens": target_tokens,
                },
        )
        return response
    elif model_provider.lower() == "openrouter":
        # Tu można dodać implementację dla OpenRoutera, np. używając openai SDK z odpowiednim endpointem
        raise NotImplementedError("OpenRouter integration is not implemented yet")
    elif model_provider.lower() == "ollama":
        # Tu można dodać implementację dla Ollama, np. wysyłając zapytania HTTP do lokalnego endpointa
        raise NotImplementedError("Ollama integration is not implemented yet")

    raise ValueError(f"Model provider {model_provider} is not implemented yet")

def generate_summary(
        text: str, source_url: str, model_name: str, model_provider: str
) -> dict[str, Any]:
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
        "LLM: model=%s:%s text_chars=%s target_tokens=%s",
        model_provider, model_name,
        len(text),
        target_tokens,
    )

    response = _generate_content(prompt, target_tokens, model_name, model_provider)
    # client.models.generate_content(
    #     model=_GEMINI_MODEL,
    #     contents=prompt,
    #     config={
    #         "response_mime_type": "application/json",
    #         "response_schema": SummaryResponse,
    #         "max_output_tokens": target_tokens,
    #     },
    # )

    usage_meta = getattr(response, "usage_metadata", None)
    logger.info(
        "LLM: model=%s:%s finish_reason=%s input_tokens=%s output_tokens=%s thinking_tokens=%s",
        model_provider, model_name,
        response.candidates[0].finish_reason if response.candidates else None,
        getattr(usage_meta, "prompt_token_count", 0),
        getattr(usage_meta, "candidates_token_count", 0),
        getattr(usage_meta, "thoughts_token_count", 0),
    )

    # pprint.pprint("raw gemini response:")
    # pprint.pprint(response)
    # pprint.pprint(response.text)
    # print("\n\n")

    def _extract_usage():
        return {
            "input_tokens": getattr(usage_meta, "prompt_token_count", 0),
            "output_tokens": getattr(usage_meta, "candidates_token_count", 0),
            "thinking_tokens": getattr(usage_meta, "thoughts_token_count", 0),
            "total_tokens": getattr(usage_meta, "total_token_count", 0),
        }

    if response.parsed is not None:
        if isinstance(response.parsed, SummaryResponse):
            result = response.parsed.model_dump()
            if source_url:
                result["source_url"] = source_url
            result["usage"] = _extract_usage()
            return result

        result = SummaryResponse.model_validate(response.parsed).model_dump()
        if source_url:
            result["source_url"] = source_url
        result["usage"] = _extract_usage()
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
    result["usage"] = _extract_usage()

    logger.debug(
        "LLM: response parsed title_len=%s summary_len=%s",
        len(result.get("title", "")),
        len(result.get("short_summary", "")),
    )

    return result
