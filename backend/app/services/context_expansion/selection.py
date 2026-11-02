import structlog

from ...schemas.context_expansion import RelatedSource, SearchCandidate
from ...schemas.summary import UsageMetadata

log = structlog.get_logger(__name__)


def deduplicate_candidates(
    candidates: list[SearchCandidate], source_url: str
) -> list[SearchCandidate]:
    """Drops repeated URLs and every candidate from the source's own domain."""
    raise NotImplementedError


async def select_related_sources(
    source_text: str,
    candidates: list[SearchCandidate],
    model_provider: str,
    model_name: str,
) -> tuple[list[RelatedSource], UsageMetadata]:
    """LLM picks at most settings.context_selected_sources candidates and says why."""
    raise NotImplementedError
