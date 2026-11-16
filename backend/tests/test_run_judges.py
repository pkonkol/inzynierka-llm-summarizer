import sys

import pytest

from app.core.config import Settings
from calibration import run_judges
from calibration.run_judges import JUDGE_CANDIDATES


def test_judge_candidates_are_in_the_supported_models() -> None:
    catalog = Settings.model_fields["supported_models"].default

    missing = [
        judge.model_id() for judge in JUDGE_CANDIDATES if judge.name not in catalog[judge.provider]
    ]

    assert missing == []


def test_model_and_all_candidates_are_mutually_exclusive(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "run_judges",
            "--model",
            "openrouter:qwen/qwen3.8-flash",
            "--all-candidates",
            "--split",
            "test",
        ],
    )

    with pytest.raises(SystemExit) as exit_info:
        run_judges.main()

    assert exit_info.value.code == 2
