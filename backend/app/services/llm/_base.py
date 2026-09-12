"""Shared LLM utilities: model factory, prompt helpers, output parsers."""

from typing import Any, cast

import structlog
from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from ...core.config import settings
from ...schemas.summary import UsageMetadata
from ...schemas.summary_spec import NarrativeStance, SummaryFunction, SummarySpec

log = structlog.get_logger(__name__)


class LlmOutputError(ValueError):
    """Raised when the model returns an empty/unparseable response.

    Carries the raw text so the job record can store what the model actually produced.
    """

    def __init__(self, message: str, raw_output: str) -> None:
        super().__init__(message)
        self.raw_output = raw_output


def validate_model(model_provider: str, model_name: str) -> None:
    """Raises ValueError when the provider/model pair is not in settings.supported_models."""
    provider = model_provider.lower()
    if provider not in settings.supported_models:
        raise ValueError(f"Unsupported model provider: {model_provider}")
    if model_name.lower() not in [m.lower() for m in settings.supported_models[provider]]:
        raise ValueError(f"Unsupported model name: {model_name} for provider {model_provider}")


def build_llm(model_provider: str, model_name: str) -> BaseChatModel:
    validate_model(model_provider, model_name)
    provider = model_provider.lower()

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


def build_structured_llm(
    structure: type, model_provider: str, model_name: str
) -> Runnable[Any, dict[str, Any]]:
    llm = build_llm(model_provider, model_name)
    extra = {"method": "json_mode"} if model_provider.lower() == "openrouter" else {}

    return cast(
        Runnable[Any, dict[str, Any]],
        llm.with_structured_output(structure, include_raw=True, **extra),
    )


def prompt_texts(prompt: ChatPromptTemplate, label: str) -> list[tuple[str, str]]:
    """The (role, template text) pairs behind a prompt, recorded on every LlmSummaryResult.

    Generalized to N messages (not just system+human) because the reminder message added in
    _prompts.py makes every template 3 messages long.
    """
    texts = []
    for message in prompt.messages:
        template = getattr(getattr(message, "prompt", None), "template", None)
        role = type(message).__name__.removesuffix("MessagePromptTemplate").lower()
        texts.append((f"[{label}] {role}", template if template is not None else str(message)))
    return texts


GENERIC_DETAIL_GUIDANCE = (
    "Return only valid JSON matching the requested schema. "
    "Do not wrap the response in markdown code fences. "
    "Do not add extra keys or explanatory text."
)

_STANCE_GUIDANCE: dict[NarrativeStance, str] = {
    "voice_of_document": (
        "Write in the voice of the document: state its content directly as fact "
        '(e.g. "Lehman Brothers collapsed in September 2008."), not as a description of '
        'the document (e.g. "The article reports that...").'
    ),
    "about_document": (
        "Write about the document, describing what it covers rather than restating its "
        'content directly (e.g. "This article discusses..." / "This paper presents...").'
    ),
}

_FUNCTION_GUIDANCE: dict[SummaryFunction, str] = {
    "informative": (
        "Write an informative summary: it must be able to substitute for the source — "
        "include the actual facts, findings, and conclusions, not just the topics covered."
    ),
    "indicative": (
        "Write an indicative summary: signal what topics and scope the source covers so a "
        "reader can decide whether to read it, without restating its specific facts or findings."
    ),
    "mixed": ("Write a summary that both signals the source's scope and includes its key facts."),
}


def build_stance_guidance(stance: NarrativeStance) -> str:
    return _STANCE_GUIDANCE[stance]


def build_function_guidance(summary_function: SummaryFunction) -> str:
    return _FUNCTION_GUIDANCE[summary_function]


def build_length_guidance(target_words: int, target_sentences: int) -> str:
    return f"Write approximately {target_words} words across {target_sentences} sentence(s)."


TAKEAWAY_DETAIL_GUIDANCE = (
    "Write key_takeaways as a JSON array of strings (list[str]), one concise takeaway per array item. "
    "Do not return markdown bullets or numbered lists. "
    "Keep the points specific, content-rich, and non-redundant. "
    "Cover the important facts from the source without repeating the same idea."
)


def build_detail_guidance(spec: SummarySpec, target_words: int, target_sentences: int) -> str:
    """The single string interpolated into every prompt's {detail_guidance} slot, and again
    verbatim into the closing reminder message — see _prompts.py's _REMINDER_MESSAGE.
    """
    parts = [
        GENERIC_DETAIL_GUIDANCE,
        build_stance_guidance(spec.narrative_stance),
        build_function_guidance(spec.summary_function),
    ]
    if spec.output_format == "bullets":
        parts.append(TAKEAWAY_DETAIL_GUIDANCE)
    parts.append(build_length_guidance(target_words, target_sentences))
    if spec.extra_instructions:
        parts.append(f"Additional instructions from the user: {spec.extra_instructions}")
    return "\n".join(parts)


def build_focus_query_clause(focus_query: str | None) -> str:
    return f"\n\nFocus specifically on: {focus_query}" if focus_query else ""


def as_dict(obj: Any) -> dict[str, Any]:
    if obj is None:
        return {}
    if isinstance(obj, BaseModel):
        return obj.model_dump()
    if isinstance(obj, dict):
        return obj
    log.warning("llm metadata has an unexpected shape", shape=type(obj).__name__)
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
    log.warning("llm content is neither str nor block list", shape=type(content).__name__)
    return str(content)


def _token_count(usage_meta: dict[str, Any], key: str) -> int:
    """Providers may omit a key or report it as null — both mean 'no tokens counted'."""
    value = usage_meta.get(key)
    return value if isinstance(value, int) else 0


def extract_usage(ai_message: Any) -> tuple[UsageMetadata, dict[str, Any]]:
    usage_meta = as_dict(getattr(ai_message, "usage_metadata", None) or {})
    response_meta = as_dict(getattr(ai_message, "response_metadata", None) or {})

    usage = UsageMetadata(
        input_tokens=_token_count(usage_meta, "input_tokens"),
        output_tokens=_token_count(usage_meta, "output_tokens"),
        # langchain_core.messages.ai.OutputTokenDetails — the key every provider maps into.
        thinking_tokens=_token_count(as_dict(usage_meta.get("output_token_details")), "reasoning"),
        total_tokens=_token_count(usage_meta, "total_tokens"),
    )
    log.debug(
        "extracting token usage from ai_message",
        ai_message=ai_message,
        usage=usage,
        usage_meta=usage_meta,
    )
    if usage.total_tokens == 0 and (usage.input_tokens or usage.output_tokens):
        usage = usage.model_copy(update={"total_tokens": usage.input_tokens + usage.output_tokens})

    raw_metadata: dict[str, Any] = {}
    if usage_meta:
        raw_metadata["usage_metadata"] = usage_meta
    if response_meta:
        raw_metadata["response_metadata"] = response_meta

    return usage, raw_metadata


def raw_output_str(raw_invoke_output: dict[str, Any]) -> str:
    raw_msg = raw_invoke_output.get("raw")
    content = getattr(raw_msg, "content", None)
    if content is None:
        log.warning("llm returned no content", shape=type(raw_msg).__name__)
        return ""
    return extract_text_from_content(content)


def parse_structured_output(
    raw_invoke_output: dict[str, Any] | BaseModel, mode: str, stage: str
) -> tuple[Any, str, UsageMetadata, dict[str, Any]]:
    if isinstance(raw_invoke_output, BaseModel):
        raw_invoke_output = raw_invoke_output.model_dump()

    raw_str = raw_output_str(raw_invoke_output)
    parsed = raw_invoke_output.get("parsed")
    if parsed is None:
        log.error("llm output unparseable", mode=mode, stage=stage, raw_output=raw_str)
        raise LlmOutputError(
            f"[{mode}] model returned unparseable {stage} response", raw_output=raw_str
        )

    usage, raw_metadata = extract_usage(raw_invoke_output.get("raw"))
    return parsed, raw_str, usage, raw_metadata
