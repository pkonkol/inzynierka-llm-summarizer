"""Step 5: run one judge candidate with one prompt version over a split and store its verdicts in predictions/."""

from __future__ import annotations

from app.schemas.calibration_api import CalibrationSplit
from app.services.metrics.fact_level_judges import JudgeModelRef


async def run_candidate(judge: JudgeModelRef, split: CalibrationSplit) -> None:
    raise NotImplementedError


def main() -> None:
    raise NotImplementedError


if __name__ == "__main__":
    main()
