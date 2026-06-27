from fastapi import APIRouter
import logging
from ..core.config import settings

router = APIRouter(prefix="/api/v1/meta", tags=["meta"])
logger = logging.getLogger(__name__)


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
