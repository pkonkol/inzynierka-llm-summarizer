import json
import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, SecretStr

from ..core.config import settings
from ..schemas.schemas import UsageMetadata
from ..schemas.summary import SummaryResponse

logger = logging.getLogger(__name__)

_SUMMARY_PROMPT_MESSAGES = [
    ("system",
     "You are an expert summarizer. Write the entire output in language code: {language}. "
     "Return only valid JSON matching the requested schema."),
    ("human",
     "Summarize the following web content. {detail_guidance}\n"
     "Format key_takeaways as a markdown bullet list, one takeaway per line. "
     "Ensure key_takeaways is content-rich and specific, not generic.\n\n"
     "Source URL: {source_url}\n"
     "Content:\n{text}"),
]

_SUMMARY_PROMPT = ChatPromptTemplate.from_messages(_SUMMARY_PROMPT_MESSAGES)


def _build_llm(model_provider: str, model_name: str) -> BaseChatModel:
    """Factory: returns a LangChain chat model for the given provider."""
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


def _build_detail_guidance(text: str) -> str:
    n = len(text)
    if n < 3000:
        return "Write a compact summary with 3-4 key takeaways."
    if n < 9000:
        return "Write a medium-depth summary with 5-7 specific key takeaways."
    return "Write a detailed summary with 8-12 concrete key takeaways and nuanced context."


def _as_dict(obj: Any) -> dict[str, Any]:
    """Coerce Pydantic BaseModel or plain dict to dict safely."""
    if isinstance(obj, BaseModel):
        return obj.model_dump()
    if isinstance(obj, dict):
        return obj
    return {}


def _extract_text_from_content(content: Any) -> str:
    """
    Normalize AIMessage.content to a plain string.
    Gemini returns a list of blocks: [{'type': 'text', 'text': '...', 'extras': {...}}]
    Other providers return a plain string.
    """
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


def _extract_usage(ai_message: Any) -> tuple[UsageMetadata, dict[str, Any]]:
    """Normalize usage from AIMessage across providers; return (usage, raw_metadata)."""
    usage_meta = _as_dict(getattr(ai_message, "usage_metadata", None) or {})
    response_meta = _as_dict(getattr(ai_message, "response_metadata", None) or {})

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


def _raw_output_str(raw_invoke_output: Any) -> str:
    """
    Extract the raw LLM text from include_raw=True chain output.
    Always returns a clean plain string — never a Python repr of a list.
    """
    if not isinstance(raw_invoke_output, dict):
        return str(raw_invoke_output)
    raw_msg = raw_invoke_output.get("raw")
    content = getattr(raw_msg, "content", None)
    if content is None:
        return ""
    return _extract_text_from_content(content)


def generate_summary(
    text: str, source_url: str, model_name: str, model_provider: str, language: str
) -> dict[str, Any]:
    """
    Returns a dict with all result fields.
    On parse failure raises ValueError with raw_output attached as .raw_output attribute.
    """
    if not text or not text.strip():
        raise ValueError("Input text cannot be empty")

    llm = _build_llm(model_provider, model_name)
    chain = _SUMMARY_PROMPT | llm.with_structured_output(SummaryResponse, include_raw=True)

    logger.debug("LLM: model=%s:%s text_chars=%s", model_provider, model_name, len(text))

    detail_guidance = _build_detail_guidance(text)
    invoke_params = {
        "language": language,
        "detail_guidance": detail_guidance,
        "source_url": source_url or "",
        "text": text.strip(),
    }

    raw_invoke_output: dict[str, Any] | BaseModel = chain.invoke(invoke_params)

    if isinstance(raw_invoke_output, BaseModel):
        raw_invoke_output = raw_invoke_output.model_dump()

    raw_content_str = _raw_output_str(raw_invoke_output)
    logger.debug("LLM raw output:\n%s\n", raw_content_str)

    parsed: SummaryResponse | None = raw_invoke_output.get("parsed")

    if parsed is None:
        err = ValueError(
            f"Model {model_provider}:{model_name} returned empty/unparseable response."
        )
        err.raw_output = raw_content_str  # type: ignore[attr-defined]
        raise err

    ai_message = raw_invoke_output.get("raw")
    logger.info("LLM: model=%s:%s summary generated", model_provider, model_name)

    usage, raw_metadata = _extract_usage(ai_message)

    logger.debug("PROMPT_TEMPLATE_EXPORT:\n%s\n", json.dumps(_SUMMARY_PROMPT_MESSAGES, indent=2, ensure_ascii=False))

    result = parsed.model_dump()
    if source_url:
        result["source_url"] = source_url
    result["usage"] = usage.model_dump()
    result["raw_metadata"] = raw_metadata
    result["raw_output"] = raw_content_str
    result["input_text"] = text.strip()
    result["prompt_template"] = list(_SUMMARY_PROMPT_MESSAGES)
    result["prompt_params"] = {k: v for k, v in invoke_params.items() if k != "text"}
    return result
