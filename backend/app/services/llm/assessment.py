"""Assessment of an article against related sources, written as its own text after the summary."""

import structlog
from pydantic import BaseModel

from ...schemas.fact_check import LlmAssessmentRequest, LlmAssessmentResult
from ._base import (
    build_language_instruction,
    build_structured_llm,
    neutralize_block_tags,
    parse_structured_output,
    related_source_blocks,
)
from ._prompts import ASSESSMENT_FOCUS, ASSESSMENT_FROM_SOURCES

log = structlog.get_logger(__name__)


class AssessmentOutput(BaseModel):
    text: str


async def generate_assessment(request: LlmAssessmentRequest) -> LlmAssessmentResult:
    """Writes how the related sources assess the content's key claims, every statement marked [n]."""
    log.debug(
        "generating assessment",
        provider=request.model_provider,
        model=request.model_name,
        source_count=len(request.related_sources),
        target_words=request.target_words,
    )
    llm = build_structured_llm(AssessmentOutput, request.model_provider, request.model_name)
    raw = await (ASSESSMENT_FROM_SOURCES | llm).ainvoke(
        {
            "language_instruction": build_language_instruction(request.language),
            "target_words": request.target_words,
            "focus": ASSESSMENT_FOCUS,
            "text": neutralize_block_tags(request.text.strip()),
            "related_sources": related_source_blocks(request.related_sources),
        }
    )
    parsed, raw_str, usage, _raw_metadata = parse_structured_output(raw, "assessment", "assessment")
    return LlmAssessmentResult(text=parsed.text, usage=usage, raw_output=raw_str)
