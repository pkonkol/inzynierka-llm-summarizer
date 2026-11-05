import structlog
from fastapi import APIRouter, Depends

from ..core.auth import require_auth
from ..schemas.calibration_api import (
    CalibrationLabels,
    CalibrationSampleResponse,
    KeyfactsApproval,
    PairVerdict,
    SummaryLabels,
)

# Local-only: every route answers 404 unless CALIBRATION_DATA_DIR is set.
router = APIRouter(
    prefix="/api/v1/research/calibration",
    tags=["calibration"],
    dependencies=[Depends(require_auth)],
)
log = structlog.get_logger(__name__)


@router.get("/sample", response_model=CalibrationSampleResponse)
async def get_calibration_sample() -> CalibrationSampleResponse:
    raise NotImplementedError


@router.get("/labels", response_model=CalibrationLabels)
async def get_calibration_labels() -> CalibrationLabels:
    raise NotImplementedError


@router.put("/labels/{summary_id}", response_model=CalibrationLabels)
async def save_summary_labels(summary_id: str, payload: SummaryLabels) -> CalibrationLabels:
    raise NotImplementedError


@router.put("/keyfacts/{source_id}", response_model=CalibrationLabels)
async def save_keyfacts_approval(source_id: str, payload: KeyfactsApproval) -> CalibrationLabels:
    raise NotImplementedError


@router.put("/pairs/{source_id}", response_model=CalibrationLabels)
async def save_pair_verdict(source_id: str, payload: PairVerdict) -> CalibrationLabels:
    raise NotImplementedError
