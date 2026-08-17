# schemas/evaluation_set_api.py — request/response shapes for /api/v1/research evaluation sets

from datetime import datetime
from typing import Literal

from .base import ApiModel
from .shared_metrics import GoldenMetrics


class EvaluationSetEntryImport(ApiModel):
    input_text: str
    golden_summary: str
    title: str
    url: str
    golden_metrics: GoldenMetrics | None = None


class EvaluationSetImportRequest(ApiModel):
    name: str
    language: str = "en"
    entries: list[EvaluationSetEntryImport]


class EvaluationSetEntryResponse(ApiModel):
    """input_text is deliberately excluded — fetched separately via the input-text endpoint."""

    entry_id: str
    golden_summary: str
    title: str
    url: str
    golden_metrics: GoldenMetrics | None = None


class EvaluationSetEntryInputTextResponse(ApiModel):
    entry_id: str
    input_text: str


class EvaluationSetListItemResponse(ApiModel):
    evaluation_set_id: str
    name: str
    language: str
    entry_count: int
    run_count: int
    created_at: datetime


class EvaluationSetCreateResponse(ApiModel):
    evaluation_set_id: str
    name: str
    language: str
    entry_count: int
    created_at: datetime


class EvaluationSetDetailResponse(ApiModel):
    evaluation_set_id: str
    name: str
    language: str
    created_at: datetime
    entries: list[EvaluationSetEntryResponse]


class EvaluationSetExportResponse(ApiModel):
    """Mirrors EvaluationSetImportRequest so an exported file can be imported back."""

    name: str
    language: str
    entries: list[EvaluationSetEntryImport]


class EvaluationSetDeletedResponse(ApiModel):
    status: Literal["deleted"]
    evaluation_set_id: str
    deleted_runs: int


class GoldenMetricsBackfillResponse(ApiModel):
    status: Literal["ok"]
    updated_entries: int
    total_entries: int
