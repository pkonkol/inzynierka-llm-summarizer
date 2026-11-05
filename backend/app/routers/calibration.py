from pathlib import Path
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException

from ..core.auth import require_auth
from ..core.config import settings
from ..schemas.calibration_api import (
    BlindPair,
    BlindSummary,
    CalibrationLabels,
    CalibrationSample,
    CalibrationSampleResponse,
    CalibrationSource,
    CalibrationSummary,
    KeyfactsApproval,
    PairVerdict,
    SummaryLabels,
)
from ..services.calibration_files import read_labels, read_sample, write_labels
from ..services.metrics.fact_level_judges import MAX_KEYFACTS

log = structlog.get_logger(__name__)


def require_calibration_data_dir() -> Path:
    if settings.calibration_data_dir is None:
        raise HTTPException(status_code=404, detail="Calibration is not enabled")
    return settings.calibration_data_dir


CalibrationDataDir = Annotated[Path, Depends(require_calibration_data_dir)]

# Local-only: every route answers 404 unless CALIBRATION_DATA_DIR is set.
router = APIRouter(
    prefix="/api/v1/research/calibration",
    tags=["calibration"],
    dependencies=[Depends(require_auth), Depends(require_calibration_data_dir)],
)


def _source_or_404(sample: CalibrationSample, source_id: str) -> CalibrationSource:
    for source in sample.sources:
        if source.source_id == source_id:
            return source
    raise HTTPException(status_code=404, detail="Calibration source not found")


def _summary_or_404(sample: CalibrationSample, summary_id: str) -> CalibrationSummary:
    for summary in sample.summaries:
        if summary.summary_id == summary_id:
            return summary
    raise HTTPException(status_code=404, detail="Calibration summary not found")


def _source_summaries(sample: CalibrationSample, source_id: str) -> list[CalibrationSummary]:
    # summary_id is random, so ordering by it hides which summary is the golden one.
    return sorted(
        (summary for summary in sample.summaries if summary.source_id == source_id),
        key=lambda summary: summary.summary_id,
    )


def _current_keyfacts(source: CalibrationSource, labels: CalibrationLabels) -> list[str]:
    if source.source_id in labels.keyfacts:
        return labels.keyfacts[source.source_id].keyfacts
    return source.keyfacts


@router.get("/sample", response_model=CalibrationSampleResponse)
async def get_calibration_sample(data_dir: CalibrationDataDir) -> CalibrationSampleResponse:
    log.debug("reading calibration sample", data_dir=str(data_dir))
    sample = read_sample(data_dir)
    summaries = []
    pairs = []

    for source in sample.sources:
        source_summaries = _source_summaries(sample, source.source_id)
        summaries += [
            BlindSummary(
                summary_id=summary.summary_id,
                source_id=summary.source_id,
                sentences=summary.sentences,
            )
            for summary in source_summaries
        ]
        first, second = source_summaries
        pairs.append(
            BlindPair(
                source_id=source.source_id,
                first_summary_id=first.summary_id,
                second_summary_id=second.summary_id,
            )
        )
    return CalibrationSampleResponse(sources=sample.sources, summaries=summaries, pairs=pairs)


@router.get("/labels", response_model=CalibrationLabels)
async def get_calibration_labels() -> CalibrationLabels:
    return read_labels()


@router.put("/labels/{summary_id}", response_model=CalibrationLabels)
async def save_summary_labels(
    summary_id: str, payload: SummaryLabels, data_dir: CalibrationDataDir
) -> CalibrationLabels:
    log.debug("saving summary labels", summary_id=summary_id)
    sample = read_sample(data_dir)
    summary = _summary_or_404(sample, summary_id)
    labels = read_labels()
    keyfacts = _current_keyfacts(_source_or_404(sample, summary.source_id), labels)

    if len(payload.sentences) != len(summary.sentences):
        raise HTTPException(
            status_code=422,
            detail=f"Expected {len(summary.sentences)} sentence labels, got {len(payload.sentences)}",
        )
    if len(payload.keyfacts_present) != len(keyfacts):
        raise HTTPException(
            status_code=422,
            detail=f"Expected {len(keyfacts)} key fact labels, got {len(payload.keyfacts_present)}",
        )

    labels.summaries[summary_id] = payload
    write_labels(labels)
    log.info("summary labels saved", summary_id=summary_id, labelled=len(labels.summaries))
    return labels


@router.put("/keyfacts/{source_id}", response_model=CalibrationLabels)
async def save_keyfacts_approval(
    source_id: str, payload: KeyfactsApproval, data_dir: CalibrationDataDir
) -> CalibrationLabels:
    log.debug("saving key facts", source_id=source_id)
    sample = read_sample(data_dir)
    source = _source_or_404(sample, source_id)
    labels = read_labels()

    if not 1 <= len(payload.keyfacts) <= MAX_KEYFACTS or not all(
        keyfact.strip() for keyfact in payload.keyfacts
    ):
        raise HTTPException(
            status_code=422, detail=f"Expected 1 to {MAX_KEYFACTS} non-blank key facts"
        )
    labelled_summaries = [
        summary.summary_id
        for summary in _source_summaries(sample, source_id)
        if summary.summary_id in labels.summaries
    ]
    if labelled_summaries and len(payload.keyfacts) != len(_current_keyfacts(source, labels)):
        raise HTTPException(
            status_code=409,
            detail="Summaries of this source are labelled against the current key facts; keep their count",
        )

    labels.keyfacts[source_id] = payload
    write_labels(labels)
    log.info("key facts approved", source_id=source_id, keyfacts=len(payload.keyfacts))
    return labels


@router.put("/pairs/{source_id}", response_model=CalibrationLabels)
async def save_pair_verdict(
    source_id: str, payload: PairVerdict, data_dir: CalibrationDataDir
) -> CalibrationLabels:
    log.debug("saving pair verdict", source_id=source_id)
    sample = read_sample(data_dir)
    _source_or_404(sample, source_id)

    pair_ids = {summary.summary_id for summary in _source_summaries(sample, source_id)}
    if payload.better_summary_id not in pair_ids:
        raise HTTPException(status_code=422, detail="The better summary must be one of this pair")

    labels = read_labels()
    labels.pairs[source_id] = payload
    write_labels(labels)
    log.info("pair verdict saved", source_id=source_id)
    return labels
