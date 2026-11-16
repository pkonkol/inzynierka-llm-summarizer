"""Assessment of an article against related sources, written as its own text after the summary."""

import structlog

from ...schemas.fact_check import LlmAssessmentRequest, LlmAssessmentResult

log = structlog.get_logger(__name__)


async def generate_assessment(request: LlmAssessmentRequest) -> LlmAssessmentResult:
    """Writes how the related sources assess the content's key claims, every statement marked [n]."""
    raise NotImplementedError
