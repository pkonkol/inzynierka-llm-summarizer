"""Assessment of an article against related sources, written as its own text after the summary."""

import structlog
from pydantic import BaseModel

from ...schemas.fact_check import LlmAssessmentRequest, LlmAssessmentResult, SourceStance
from ._base import (
    build_language_instruction,
    build_structured_llm,
    neutralize_block_tags,
    parse_structured_output,
    related_source_blocks,
)
from ._prompts import ASSESSMENT_FOCUS, ASSESSMENT_FROM_SOURCES

log = structlog.get_logger(__name__)


class SourceStanceOutput(BaseModel):
    source: int  # the [n] number of the related source
    stance: SourceStance


class AssessmentOutput(BaseModel):
    text: str
    source_stances: list[SourceStanceOutput]


def _stance_per_source(output: AssessmentOutput, source_count: int) -> list[SourceStance]:
    """A source the model gave no stance, or named by a number outside the list, counts as context."""
    stance_by_number = {item.source: item.stance for item in output.source_stances}
    unknown_numbers = set(stance_by_number) - set(range(1, source_count + 1))
    if unknown_numbers:
        log.warning("assessment named unknown sources", numbers=sorted(unknown_numbers))
    return [stance_by_number.get(number, "context") for number in range(1, source_count + 1)]


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
    return LlmAssessmentResult(
        text=parsed.text,
        source_stances=_stance_per_source(parsed, len(request.related_sources)),
        usage=usage,
        raw_output=raw_str,
    )
