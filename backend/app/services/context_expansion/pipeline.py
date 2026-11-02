import structlog

from ...schemas.context_expansion import ContextExpansionMode, ContextExpansionResult
from ...schemas.job_db import JobErrorCode

log = structlog.get_logger(__name__)


class ContextExpansionError(RuntimeError):
    code: JobErrorCode = "context_expansion_failed"


async def expand_context(
    source_text: str,
    source_url: str,
    mode: ContextExpansionMode,
    model_provider: str,
    model_name: str,
) -> ContextExpansionResult:
    """Finds and selects related sources for one summary; raises ContextExpansionError when every channel failed."""
    raise NotImplementedError
