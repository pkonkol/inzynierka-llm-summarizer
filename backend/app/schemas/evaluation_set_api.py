# schemas/evaluation_set_api.py — request/response shapes for /api/v1/research evaluation sets

from datetime import datetime
from typing import Literal

from .base import ApiModel
from .evaluation_set_db import GoldenMetricsPassStatus
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
    # Judge calls cost money and time, so importing raw text without golden metrics yet is a
    # real use case — this is how that request opts out of the automatic background pass.
    compute_golden_metrics: bool = True


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
    golden_metrics_status: GoldenMetricsPassStatus | None = None
    entries_with_metrics: int


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


class GoldenMetricsPassResponse(ApiModel):
    """GET-only progress view — no metric values, just enough to render a progress bar."""

    status: GoldenMetricsPassStatus | None
    entry_count: int
    entries_with_metrics: int
    started_at: datetime | None
    finished_at: datetime | None
    error: str | None


class GoldenMetricsPassQueuedResponse(ApiModel):
    status: Literal["queued"]
    evaluation_set_id: str
