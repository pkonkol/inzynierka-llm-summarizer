# schemas/meta_api.py — request/response shapes for /api/v1/meta

from .base import ApiModel


class VersionResponse(ApiModel):
    git_sha: str


class KeepaliveResponse(ApiModel):
    active_work: int
    held_seconds: float
