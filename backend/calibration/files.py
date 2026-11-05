"""Where the calibration files live and how they are read and written; the one place that knows the layout."""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel

from app.schemas.calibration_api import CalibrationLabels, CalibrationSample

REPO_ROOT = Path(__file__).resolve().parents[2]
# Committed: ids and verdicts only, no source text.
LABELS_DIR = REPO_ROOT / "eval" / "calibration" / "labels"


class NegativeExpectation(BaseModel):
    sentence_faithful: list[bool]
    keyfact_present: list[bool]
    coherent: bool


class Negative(BaseModel):
    negative_id: str
    base_summary_id: str
    kind: str
    degree: str
    generator_model: str
    sentences: list[str]
    expected: NegativeExpectation


def read_sample(data_dir: Path) -> CalibrationSample:
    raise NotImplementedError


def write_sample(data_dir: Path, sample: CalibrationSample) -> None:
    raise NotImplementedError


def read_labels() -> CalibrationLabels:
    raise NotImplementedError


def write_labels(labels: CalibrationLabels) -> None:
    raise NotImplementedError


def read_negatives(data_dir: Path) -> list[Negative]:
    raise NotImplementedError


def write_negatives(data_dir: Path, negatives: list[Negative]) -> None:
    raise NotImplementedError
