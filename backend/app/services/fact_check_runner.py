# services/fact_check_runner.py — the background fact check started after a job's summary completes

import structlog

from ..core.background_work import track_background_work

log = structlog.get_logger(__name__)

NO_SOURCES_TEXT = "Nie znaleziono źródeł do porównania."


@track_background_work("fact_check")
async def run_fact_check(job_id: str, source_text: str) -> None:
    """Searches the web for the job's source, writes the assessment and stores it on the job; never touches the summary."""
    raise NotImplementedError


def spawn_fact_check(job_id: str, source_text: str) -> None:
    raise NotImplementedError
