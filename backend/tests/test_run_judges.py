import subprocess
import sys
from pathlib import Path

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


def test_all_candidates_continue_after_a_failed_candidate(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    launched_models: list[str] = []

    def fake_run(command: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        model = command[command.index("--model") + 1]
        launched_models.append(model)
        is_first_candidate = len(launched_models) == 1
        exit_code = 1 if is_first_candidate else 0
        return subprocess.CompletedProcess(command, exit_code)

    monkeypatch.setattr(run_judges.subprocess, "run", fake_run)
    monkeypatch.setattr(run_judges.settings, "calibration_data_dir", tmp_path)
    monkeypatch.setattr(sys, "argv", ["run_judges", "--all-candidates", "--split", "test"])

    with pytest.raises(SystemExit, match=JUDGE_CANDIDATES[0].model_id()):
        run_judges.main()

    assert launched_models == [judge.model_id() for judge in JUDGE_CANDIDATES]
