import structlog

from ...schemas.context_expansion import SearchCandidate

log = structlog.get_logger(__name__)


async def search_science(queries: list[str]) -> list[SearchCandidate]:
    """OpenAlex works matched on title and abstract."""
    raise NotImplementedError
