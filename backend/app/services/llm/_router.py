"""Public entry point — routes to the appropriate summarization strategy."""

import structlog

from ...schemas.summary import LlmSummaryRequest, LlmSummaryResult
from ...schemas.summary_spec import ProcessingStrategy
from . import direct, extract_then_synthesize

log = structlog.get_logger(__name__)

_RUNNERS = {
    "direct": direct.run,
    "extract_then_synthesize": extract_then_synthesize.run,
}


async def generate_summary(
    request: LlmSummaryRequest, strategy: ProcessingStrategy = "direct"
) -> LlmSummaryResult:
    """
    Router — delegates to the requested processing strategy.

    Strategies:
        direct                  — single prompt, extractor + abstractor in one LLM call (default)
        extract_then_synthesize — takeaways first, final output derived from takeaways

    request.length is the concrete target the caller resolved from spec.length; strategies ignore spec.length.
    """
    log.info(
        "generating summary",
        strategy=strategy,
        spec=request.spec,
        provider=request.model_provider,
        model=request.model_name,
    )

    if strategy not in _RUNNERS:
        raise NotImplementedError(f"Processing strategy '{strategy}' is not implemented")

    return await _RUNNERS[strategy](request)
