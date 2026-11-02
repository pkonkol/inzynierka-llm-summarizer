import structlog

from ...schemas.context_expansion import SearchCandidate

log = structlog.get_logger(__name__)


async def search_discussions(queries: list[str]) -> list[SearchCandidate]:
    """HN Algolia stories and the top comments of each."""
    raise NotImplementedError
