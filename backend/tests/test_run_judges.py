import asyncio
import subprocess
import sys
from pathlib import Path

import pytest

from app.core.config import Settings
from app.schemas.calibration_api import (
    CalibrationLabels,
    CalibrationSample,
    CalibrationSource,
    CalibrationSummary,
    PairVerdict,
)
from app.services.calibration_files import CandidatePredictions
from app.services.metrics.fact_level_judges import JudgeModelRef
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


def _all_candidates_argv(*extra: str) -> list[str]:
    return ["run_judges", "--all-candidates", "--split", "test", *extra]


@pytest.fixture
def default_catalog(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(run_judges.settings, "calibration_data_dir", tmp_path)
    monkeypatch.setattr(
        run_judges.settings,
        "supported_models",
        Settings.model_fields["supported_models"].default,
    )


@pytest.mark.usefixtures("default_catalog")
def test_all_candidates_continue_after_a_failed_candidate(monkeypatch: pytest.MonkeyPatch) -> None:
    launched_commands: list[list[str]] = []

    def fake_run(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert kwargs["cwd"] == run_judges._BACKEND_ROOT
        launched_commands.append(command)
        is_first_candidate = len(launched_commands) == 1
        exit_code = 1 if is_first_candidate else 0
        return subprocess.CompletedProcess(command, exit_code)

    monkeypatch.setattr(run_judges.subprocess, "run", fake_run)
    monkeypatch.setattr(sys, "argv", _all_candidates_argv("--limit", "3", "--summarization-metric"))

    with pytest.raises(SystemExit, match=JUDGE_CANDIDATES[0].model_id()):
        run_judges.main()

    assert [command[command.index("--model") + 1] for command in launched_commands] == [
        judge.model_id() for judge in JUDGE_CANDIDATES
    ]
    assert launched_commands[0][1:] == [
        "-m",
        "calibration.run_judges",
        "--model",
        JUDGE_CANDIDATES[0].model_id(),
        "--split",
        "test",
        "--limit",
        "3",
        "--summarization-metric",
    ]


def test_a_model_outside_the_catalog_stops_the_run_before_any_item_is_stored(
    tmp_path: Path,
) -> None:
    judge_outside_the_catalog = JudgeModelRef("openrouter", "example/not-in-the-catalog")

    with pytest.raises(ValueError, match="Unsupported model name"):
        asyncio.run(
            run_judges.run_candidate(tmp_path, judge_outside_the_catalog, "test", None, False)
        )

    assert list(tmp_path.rglob("*.json")) == []


def _pair_source(source_id: str) -> CalibrationSource:
    return CalibrationSource(
        source_id=source_id,
        set_name="gumsum",
        language="en",
        entry_id=source_id,
        input_text="Source text.",
        keyfacts=["A fact."],
        keyfacts_approved=True,
        split="test",
    )


def _pair_summaries(source_id: str) -> list[CalibrationSummary]:
    return [
        CalibrationSummary(
            summary_id=f"{source_id}-{origin}",
            source_id=source_id,
            origin=origin,
            generator_model=None,
            processing_strategy=None,
            text="Text.",
            sentences=["Text."],
        )
        for origin in ("ai", "golden")
    ]


def test_an_unusable_pair_answer_skips_that_pair_only(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    sources = {source_id: _pair_source(source_id) for source_id in ("broken", "fine")}
    sample = CalibrationSample(
        sources=list(sources.values()),
        summaries=[summary for source_id in sources for summary in _pair_summaries(source_id)],
    )
    labels = CalibrationLabels(
        pairs={source_id: PairVerdict(better_summary_id=f"{source_id}-ai") for source_id in sources}
    )

    judged_inputs: list[str] = []

    async def fake_pairwise(
        _judge: object, input_text: str, ai_text: str, *_args: object, **_kwargs: object
    ) -> dict[str, object]:
        judged_inputs.append(ai_text)
        if len(judged_inputs) == 1:
            raise KeyError("score")
        return {"score": 0.8, "consistent": True}

    monkeypatch.setattr(run_judges, "evaluate_pairwise_cross_deepeval", fake_pairwise)
    predictions = CandidatePredictions(judge_model="openrouter:m", prompt_version="v")

    asyncio.run(
        run_judges._judge_pairs(
            sample, sources, labels, predictions, tmp_path / "predictions.json", None
        )
    )

    assert list(predictions.pairs) == ["fine"]
    assert predictions.pairs["fine"].preferred == "ai"
