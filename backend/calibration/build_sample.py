"""Step 1: pick the calibration sources, write AI summaries and key facts, split sentences, assign train/dev/test."""

from __future__ import annotations

from app.schemas.calibration_api import CalibrationSource

SOURCES_PER_SET = {"cnn_dailymail": 4, "curation": 4, "gumsum": 4, "psc": 12}


def choose_sources(
    sets: dict[str, list[dict]], counts: dict[str, int], seed: int
) -> list[CalibrationSource]:
    raise NotImplementedError


def assign_splits(sources: list[CalibrationSource], seed: int) -> list[CalibrationSource]:
    """Whole sources to train/dev/test at about 15/45/40 %, stratified by language."""
    raise NotImplementedError


def main() -> None:
    raise NotImplementedError


if __name__ == "__main__":
    main()
