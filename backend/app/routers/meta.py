import asyncio

import structlog
from fastapi import APIRouter

from ..core.background_work import wait_until_no_work_remaining
from ..core.config import settings
from ..schemas.meta_api import KeepaliveResponse, SummaryPresetOut, VersionResponse
from ..services.llm.presets import SUMMARY_PRESETS

router = APIRouter(prefix="/api/v1/meta", tags=["meta"])
log = structlog.get_logger(__name__)

_KEEPALIVE_MAX_SECONDS = 55.0


@router.get("/models", summary="Get supported models")
async def get_supported_models() -> dict[str, list[str]]:
    return settings.supported_models


@router.get("/languages", summary="Get supported languages")
async def get_supported_languages() -> list[str]:
    return settings.supported_summary_languages


@router.get("/processing-strategies", summary="Get supported processing strategies")
async def get_supported_processing_strategies() -> dict[str, str]:
    """Returns {strategy_key: human_readable_label}."""
    return settings.supported_processing_strategies


@router.get("/summary-presets", summary="Get named SummarySpec presets")
async def get_summary_presets() -> dict[str, SummaryPresetOut]:
    return {
        key: SummaryPresetOut(label=preset.label, spec=preset.spec)
        for key, preset in SUMMARY_PRESETS.items()
    }


@router.get("/version", summary="Get the build this backend was deployed from")
async def get_version() -> VersionResponse:
    return VersionResponse(git_sha=settings.git_sha)


@router.get("/keepalive", summary="Hold a connection open while background work runs")
async def keepalive() -> KeepaliveResponse:
    """Held open for as long as there is background work, up to a bounded window.

    Cloud Run may reclaim an instance that has no request in flight. Summarisation and
    evaluation both run as background tasks after their response was already sent, so this
    open connection is what keeps the instance carrying them alive.

    Returns as soon as the work finishes, so callers loop on `active_work > 0` and an idle
    caller cannot pin an instance.
    """
    loop = asyncio.get_running_loop()
    started_at = loop.time()

    active_work = await wait_until_no_work_remaining(_KEEPALIVE_MAX_SECONDS)

    held_seconds = loop.time() - started_at
    log.debug("keepalive released", active_work=active_work, duration_ms=held_seconds * 1000)
    return KeepaliveResponse(active_work=active_work, held_seconds=round(held_seconds, 1))
