import structlog

from ...schemas.context_expansion import PlannedQueries
from ...schemas.summary import UsageMetadata

log = structlog.get_logger(__name__)


async def plan_search_queries(
    source_text: str, model_provider: str, model_name: str
) -> tuple[PlannedQueries, UsageMetadata]:
    """LLM writes up to settings.context_queries_per_channel queries for each channel."""
    raise NotImplementedError
