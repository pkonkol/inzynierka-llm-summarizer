import structlog
from fastapi import APIRouter

from ..core.config import settings
from ..schemas.meta_api import VersionResponse

router = APIRouter(prefix="/api/v1/meta", tags=["meta"])
log = structlog.get_logger(__name__)


@router.get("/models", summary="Get supported models")
async def get_supported_models() -> dict[str, list[str]]:
    return settings.supported_models


@router.get("/languages", summary="Get supported languages")
async def get_supported_languages() -> list[str]:
    return settings.supported_summary_languages


@router.get("/modes", summary="Get supported summary modes")
async def get_supported_modes() -> dict[str, str]:
    """Returns {mode_key: human_readable_label}."""
    return settings.supported_summary_modes


@router.get("/version", summary="Get the build this backend was deployed from")
async def get_version() -> VersionResponse:
    return VersionResponse(git_sha=settings.git_sha)
