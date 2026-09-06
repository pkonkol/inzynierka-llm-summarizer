"""Public entry point — routes to the appropriate summarization strategy."""

import structlog

from ...schemas.job_api import SummaryMode
from ...schemas.summary import LlmSummaryResult
from . import summary_cascade, summary_sequential, summary_simple

log = structlog.get_logger(__name__)

_RUNNERS = {
    "simple": summary_simple.run,
    "sequential": summary_sequential.run,
    "cascade": summary_cascade.run,
}


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

    if mode not in _RUNNERS:
        raise NotImplementedError(f"Summary mode '{mode}' is not implemented")

    return await _RUNNERS[mode](
        input, source_url, model_name, model_provider, language, skip_takeaways
    )
