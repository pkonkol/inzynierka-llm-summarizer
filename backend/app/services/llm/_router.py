"""Public entry point — routes to the appropriate summarization strategy."""

import structlog

from ...schemas.job_api import SummaryMode
from ...schemas.summary import LlmSummaryResult
from . import summary_cascade, summary_sequential, summary_simple

log = structlog.get_logger(__name__)


async def generate_summary(
    input: dict,
    source_url: str,
    model_name: str,
    model_provider: str,
    language: str,
    mode: SummaryMode = "simple",
    skip_takeaways: bool = False,
) -> LlmSummaryResult:
    """
    Router — delegates to the requested summarization strategy.

    Modes:
        simple     — single prompt, extractor + abstractor in one LLM call (default)
        sequential — two independent prompts: takeaways first, then summary
        cascade    — takeaways first, summary derived from takeaways

    skip_takeaways saves an LLM call only in sequential mode — in simple it only shortens
    the prompt/response, and in cascade the takeaways call is unavoidable (it feeds call 2).
    """
    log.info(
        "generating summary",
        mode=mode,
        provider=model_provider,
        model=model_name,
        skip_takeaways=skip_takeaways,
    )

    if mode == "simple":
        return await summary_simple.run(
            input, source_url, model_name, model_provider, language, skip_takeaways
        )
    if mode == "sequential":
        return await summary_sequential.run(
            input, source_url, model_name, model_provider, language, skip_takeaways
        )
    if mode == "cascade":
        return await summary_cascade.run(
            input, source_url, model_name, model_provider, language, skip_takeaways
        )

    raise NotImplementedError(f"Summary mode '{mode}' is not implemented")
