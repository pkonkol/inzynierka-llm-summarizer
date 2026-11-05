"""Where the calibration files live and how they are read and written; the one place that knows the layout."""

from __future__ import annotations

import os
from pathlib import Path

from pydantic import BaseModel, TypeAdapter

from ..schemas.calibration_api import CalibrationLabels, CalibrationSample

REPO_ROOT = Path(__file__).resolve().parents[3]
# Committed: ids and verdicts only, no source text.
LABELS_DIR = REPO_ROOT / "eval" / "calibration" / "labels"

_SAMPLE_FILE = "sample.json"
_NEGATIVES_FILE = "negatives.json"
_LABELS_FILE = "labels.json"


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


_NEGATIVES = TypeAdapter(list[Negative])


def _write_atomically(path: Path, content: str) -> None:
    """Hours of labelling live in these files; a crash mid-write must leave the old version."""
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(path.suffix + ".partial")
    partial.write_text(content, encoding="utf-8")
    os.replace(partial, path)


def read_sample(data_dir: Path) -> CalibrationSample:
    return CalibrationSample.model_validate_json((data_dir / _SAMPLE_FILE).read_text("utf-8"))


def write_sample(data_dir: Path, sample: CalibrationSample) -> None:
    _write_atomically(data_dir / _SAMPLE_FILE, sample.model_dump_json(indent=2))


def read_labels() -> CalibrationLabels:
    path = LABELS_DIR / _LABELS_FILE
    if not path.exists():
        return CalibrationLabels()  # nothing labelled yet
    return CalibrationLabels.model_validate_json(path.read_text("utf-8"))


def write_labels(labels: CalibrationLabels) -> None:
    _write_atomically(LABELS_DIR / _LABELS_FILE, labels.model_dump_json(indent=2))


def read_negatives(data_dir: Path) -> list[Negative]:
    return _NEGATIVES.validate_json((data_dir / _NEGATIVES_FILE).read_text("utf-8"))


def write_negatives(data_dir: Path, negatives: list[Negative]) -> None:
    _write_atomically(
        data_dir / _NEGATIVES_FILE, _NEGATIVES.dump_json(negatives, indent=2).decode()
    )
