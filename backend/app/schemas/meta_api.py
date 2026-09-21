# schemas/meta_api.py — request/response shapes for /api/v1/meta

from .base import ApiModel
from .summary_spec import SummarySpec


class VersionResponse(ApiModel):
    git_sha: str


class SummaryPresetOut(ApiModel):
    label: str
    description: str
    spec: SummarySpec


class KeepaliveResponse(ApiModel):
    active_work: int
    held_seconds: float
