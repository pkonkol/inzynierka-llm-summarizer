# schemas/meta_api.py — request/response shapes for /api/v1/meta

from .base import ApiModel


class VersionResponse(ApiModel):
    git_sha: str
