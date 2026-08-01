"""Public entry point — routes to the appropriate summarization strategy."""
import logging
from typing import Any, Literal

from . import summary_cascade, summary_sequential, summary_simple

logger = logging.getLogger(__name__)

SummaryMode = Literal["simple", "sequential", "cascade"]


async def generate_summary(
    input: dict,
    source_url: str,
    model_name: str,
    model_provider: str,
    language: str,
    mode: SummaryMode = "simple",
) -> dict[str, Any]:
    """
    Router — delegates to the requested summarization strategy.

    Modes:
        simple     — single prompt, extractor + abstractor in one LLM call (default)
        sequential — two independent prompts: takeaways first, then summary
        cascade    — takeaways first, summary derived from takeaways
    """
    logger.info("generate_summary mode=%s model=%s:%s", mode, model_provider, model_name)

    if mode == "simple":
        return await summary_simple.run(input, source_url, model_name, model_provider, language)
    if mode == "sequential":
        return await summary_sequential.run(input, source_url, model_name, model_provider, language)
    if mode == "cascade":
        return await summary_cascade.run(input, source_url, model_name, model_provider, language)

    raise NotImplementedError(f"Summary mode '{mode}' is not implemented")
