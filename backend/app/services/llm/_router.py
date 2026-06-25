"""Public entry point — routes to the appropriate summarization strategy."""
import logging
from typing import Any, Literal

from . import summary_simple

logger = logging.getLogger(__name__)

SummaryMode = Literal["simple"]


async def generate_summary(
    text: str,
    source_url: str,
    model_name: str,
    model_provider: str,
    language: str,
    mode: SummaryMode = "simple",
) -> dict[str, Any]:
    """
    Router: delegates to the requested summarization strategy.

    Modes:
        simple     — single prompt, extractor + abstractor in one LLM call (default)
        sequential — TODO: two independent prompts for takeaways and summary
        cascade    — TODO: takeaways first, summary derived from takeaways
    """
    if not text or not text.strip():
        raise ValueError("Input text cannot be empty")

    logger.debug("generate_summary mode=%s model=%s:%s", mode, model_provider, model_name)

    if mode == "simple":
        return await summary_simple.run(text, source_url, model_name, model_provider, language)

    raise NotImplementedError(f"Summary mode '{mode}' is not implemented yet")
