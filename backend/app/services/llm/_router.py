"""Public entry point — routes to the appropriate summarization strategy."""

import structlog

from ...schemas.summary import LlmSummaryResult
from ...schemas.summary_spec import ProcessingStrategy, ResolvedLength, SummarySpec
from . import direct, extract_then_synthesize

log = structlog.get_logger(__name__)

_RUNNERS = {
    "direct": direct.run,
    "extract_then_synthesize": extract_then_synthesize.run,
}


async def generate_summary(
    input: dict,
    source_url: str,
    model_name: str,
    model_provider: str,
    language: str,
    spec: SummarySpec,
    length: ResolvedLength,
    strategy: ProcessingStrategy = "direct",
) -> LlmSummaryResult:
    """
    Router — delegates to the requested processing strategy.

    Strategies:
        direct                  — single prompt, extractor + abstractor in one LLM call (default)
        extract_then_synthesize — takeaways first, final output derived from takeaways

    length is the concrete target the caller resolved from spec.length; strategies ignore spec.length.
    """
    log.info(
        "generating summary",
        strategy=strategy,
        spec=spec,
        provider=model_provider,
        model=model_name,
    )

    if strategy not in _RUNNERS:
        raise NotImplementedError(f"Processing strategy '{strategy}' is not implemented")

    return await _RUNNERS[strategy](
        input, source_url, model_name, model_provider, language, spec, length
    )
