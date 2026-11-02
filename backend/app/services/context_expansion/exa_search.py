import structlog

from ...schemas.context_expansion import SearchCandidate

log = structlog.get_logger(__name__)


async def search_web(queries: list[str]) -> list[SearchCandidate]:
    """Exa /search with page text; Reddit as a second query restricted to reddit.com."""
    raise NotImplementedError
