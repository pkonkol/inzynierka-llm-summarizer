"""Shared LLM utilities: model factory, prompt helpers, output parsers."""
import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel

from ...core.config import settings
from ...schemas.schemas import UsageMetadata

logger = logging.getLogger(__name__)


def build_llm(model_provider: str, model_name: str) -> BaseChatModel:
    provider = model_provider.lower()
    if provider not in settings.supported_models:
        raise ValueError(f"Unsupported model provider: {model_provider}")
    if model_name.lower() not in [m.lower() for m in settings.supported_models[provider]]:
        raise ValueError(f"Unsupported model name: {model_name} for provider {model_provider}")

    if provider == "gemini":
        if not settings.gemini_api_key:
            raise ValueError("Missing GEMINI_API_KEY")
        return ChatGoogleGenerativeAI(model=model_name, api_key=settings.gemini_api_key)

    if provider == "openrouter":
        if not settings.openrouter_api_key:
            raise ValueError("Missing OPENROUTER_API_KEY")
        return ChatOpenAI(
            model=model_name,
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.openrouter_api_key,
        )

    if provider == "ollama":
        return ChatOllama(model=model_name, base_url=settings.ollama_url)

    raise NotImplementedError(f"Provider {model_provider} is not implemented yet")

def build_structured_llm(structure: type, model_provider: str, model_name: str):
    llm = build_llm(model_provider, model_name)

    if model_provider.lower() == "openrouter":
        return llm.with_structured_output(
            structure,
            include_raw=True,
            method="json_mode",
        )

    return llm.with_structured_output(
        structure,
        include_raw=True,
    )

def build_generic_detail_guidance(text: str) -> str:
    return (
        "Return only valid JSON matching the requested schema. "
        "Do not wrap the response in markdown code fences. "
        "Do not add extra keys or explanatory text."
    )


def build_summary_detail_guidance(text: str) -> str:
    return (
        "Write a fluent prose summary that stays coherent and easy to read. "
        "Include all important facts from the source without introducing information that is not present. "
        "Keep the result concise but complete."
    )


def build_takeaway_detail_guidance(text: str) -> str:
    return (
        "Write key_takeaways as a JSON array of strings (list[str]), one concise takeaway per array item. "
        "Do not return markdown bullets or numbered lists. "
        "Keep the points specific, content-rich, and non-redundant. "
        "Cover the important facts from the source without repeating the same idea."
    )


def as_dict(obj: Any) -> dict[str, Any]:
    if isinstance(obj, BaseModel):
        return obj.model_dump()
    if isinstance(obj, dict):
        return obj
    return {}


def extract_text_from_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts)
    return str(content)


def extract_usage(ai_message: Any) -> tuple[UsageMetadata, dict[str, Any]]:
    usage_meta = as_dict(getattr(ai_message, "usage_metadata", None) or {})
    response_meta = as_dict(getattr(ai_message, "response_metadata", None) or {})

    usage = UsageMetadata(
        input_tokens=usage_meta.get("input_tokens", 0),
        output_tokens=usage_meta.get("output_tokens", 0),
        thinking_tokens=usage_meta.get("input_token_details", {}).get("thinking", 0),
        total_tokens=usage_meta.get("total_tokens", 0),
    )
    if usage.total_tokens == 0 and (usage.input_tokens or usage.output_tokens):
        usage = usage.model_copy(update={"total_tokens": usage.input_tokens + usage.output_tokens})

    raw_metadata: dict[str, Any] = {}
    if usage_meta:
        raw_metadata["usage_metadata"] = usage_meta
    if response_meta:
        raw_metadata["response_metadata"] = response_meta

    return usage, raw_metadata


def raw_output_str(raw_invoke_output: Any) -> str:
    if not isinstance(raw_invoke_output, dict):
        return str(raw_invoke_output)
    raw_msg = raw_invoke_output.get("raw")
    content = getattr(raw_msg, "content", None)
    if content is None:
        return ""
    return extract_text_from_content(content)
