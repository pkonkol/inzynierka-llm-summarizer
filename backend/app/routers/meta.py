# Metadata about the app itself, config and stuff
#

from fastapi import APIRouter
import logging
from ..core.config import settings

router = APIRouter(prefix="/api/v1/meta", tags=["meta, models"])

logger = logging.getLogger(__name__)


@router.get("/models", summary="Get supported models")
async def get_supported_models() -> dict[str, list[str]]:
    return settings.supported_models

@router.get("/languages", summary="Get supported languages")
async def get_supported_languages() -> list[str]:
    return settings.supported_summary_languages