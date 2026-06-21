import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI

from ..core.config import settings
from ..schemas.schemas import UsageMetadata
from ..schemas.summary import SummaryResponse

logger = logging.getLogger(__name__)

_SUMMARY_PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "You are an expert summarizer. Write the entire output in language code: {language}. "
     "Return only valid JSON matching the requested schema."),
    ("human",
     "Summarize the following web content. {detail_guidance}\n"
     "Format key_takeaways as a markdown bullet list, one takeaway per line. "
     "Ensure key_takeaways is content-rich and specific, not generic.\n\n"
     "Source URL: {source_url}\n"
     "Content:\n{text}"),
])


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


def generate_summary(text: str, source_url: str, model_name: str, model_provider: str, language: str) -> dict[str, Any]:
    if not text or not text.strip():
        raise ValueError("Input text cannot be empty")

    llm = _build_llm(model_provider, model_name)
    chain = _SUMMARY_PROMPT | llm.with_structured_output(SummaryResponse)

    logger.debug("LLM: model=%s:%s text_chars=%s", model_provider, model_name, len(text))

    summary: SummaryResponse = chain.invoke({
        "language": language,
        "detail_guidance": _build_detail_guidance(text),
        "source_url": source_url or "",
        "text": text.strip(),
    })

    logger.info("LLM: model=%s:%s summary generated", model_provider, model_name)

    result = summary.model_dump()
    if source_url:
        result["source_url"] = source_url
    # usage metadata not available uniformly across providers in LangChain — placeholder
    result["usage"] = UsageMetadata().model_dump()
    return result
