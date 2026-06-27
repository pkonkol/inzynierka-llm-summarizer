import json
import logging
from typing import Any


from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, SecretStr

from backend.app.services.llm import summary_simple
from ..core.config import settings
from ..schemas.schemas import UsageMetadata
from ..schemas.summary import SummaryResponse

logger = logging.getLogger(__name__)


async def generate_summary(
    text: str, source_url: str, model_name: str, model_provider: str, language: str
) -> dict[str, Any]:
    """
    Returns a dict with all result fields.
    On parse failure raises ValueError with raw_output attached as .raw_output attribute.
    """
    if not text or not text.strip():
        raise ValueError("Input text cannot be empty")


    result = await summary_simple.run(text, source_url, model_name, model_provider, language)

    return result
