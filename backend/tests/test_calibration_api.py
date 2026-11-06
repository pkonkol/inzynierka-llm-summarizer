"""Cases cs33-cs39 and review rv5: the dev-only calibration API behind /admin/dev/calibration."""

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import settings
from app.routers import calibration as calibration_router
from app.schemas.calibration_api import (
    CalibrationSample,
    CalibrationSource,
    CalibrationSummary,
    SentenceLabel,
    SummaryLabels,
)
from app.services import calibration_files as files

PREFIX = "/api/v1/research/calibration"
SAMPLE = CalibrationSample(
    sources=[
        CalibrationSource(
            source_id="source-1",
            set_name="cnn_dailymail",
            language="en",
            entry_id="entry-1",
            input_text="Alpha rose. Beta fell.",
            keyfacts=["Alpha rose.", "Beta fell."],
            keyfacts_approved=True,
            split="dev",
        )
    ],
    summaries=[
        CalibrationSummary(
            summary_id="golden-x7",
            source_id="source-1",
            origin="golden",
            generator_model=None,
            processing_strategy=None,
            text="Alpha rose. Beta fell.",
            sentences=["Alpha rose.", "Beta fell."],
        ),
        CalibrationSummary(
            summary_id="ai-q3",
            source_id="source-1",
            origin="ai",
            generator_model="qwen/qwen3.8-flash",
            processing_strategy="direct",
            text="Alpha rose.",
            sentences=["Alpha rose."],
        ),
    ],
)
GOLDEN_LABELS = SummaryLabels(
    sentences=[
        SentenceLabel(faithful=True, carries_keyfact=True),
        SentenceLabel(faithful=True, carries_keyfact=True),
    ],
    keyfacts_present=[True, True],
    coherent=True,
)


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(settings, "auth_enabled", False)
    app = FastAPI()
    app.include_router(calibration_router.router)
    return TestClient(app)


@pytest.fixture
def labels_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    directory = tmp_path / "labels"
    directory.mkdir()
    monkeypatch.setattr(files, "LABELS_DIR", directory)
    return directory


@pytest.fixture
def calibration_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, labels_dir: Path) -> Path:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    files.write_sample(data_dir, SAMPLE)
    monkeypatch.setattr(settings, "calibration_data_dir", data_dir)
    return data_dir


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        pytest.param("GET", "/sample", None, id="case_33_sample"),
        pytest.param("GET", "/labels", None, id="case_33_labels"),
        pytest.param(
            "PUT",
            "/labels/golden-x7",
            GOLDEN_LABELS.model_dump(mode="json"),
            id="case_33_summary_labels",
        ),
        pytest.param(
            "PUT", "/keyfacts/source-1", {"keyfacts": ["Alpha rose."]}, id="case_33_keyfacts"
        ),
        pytest.param("PUT", "/pairs/source-1", {"better_summary_id": "ai-q3"}, id="case_33_pair"),
    ],
)
def test_case_33_every_route_is_404_without_data_dir(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
    path: str,
    body: dict | None,
) -> None:
    monkeypatch.setattr(settings, "calibration_data_dir", None)

    response = client.request(method, PREFIX + path, json=body)

    assert response.status_code == 404


def test_case_34_sample_hides_who_wrote_each_summary(
    client: TestClient, calibration_data: Path
) -> None:
    response = client.get(f"{PREFIX}/sample")

    assert response.status_code == 200
    summaries = response.json()["summaries"]
    assert {summary["summary_id"] for summary in summaries} == {"golden-x7", "ai-q3"}
    for summary in summaries:
        for hidden_field in ("origin", "generator_model", "processing_strategy", "text"):
            assert hidden_field not in summary


def test_case_35_write_without_token_is_401_when_auth_is_on(
    client: TestClient, calibration_data: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "jwt_secret", SecretStr("test-jwt-secret"))

    response = client.put(f"{PREFIX}/labels/golden-x7", json=GOLDEN_LABELS.model_dump(mode="json"))

    assert response.status_code == 401


def test_case_36_saved_labels_are_read_back_from_the_labels_dir(
    client: TestClient, calibration_data: Path, labels_dir: Path
) -> None:
    saved = client.put(f"{PREFIX}/labels/golden-x7", json=GOLDEN_LABELS.model_dump(mode="json"))
    assert saved.status_code == 200

    read_back = client.get(f"{PREFIX}/labels")

    assert read_back.json()["summaries"]["golden-x7"] == GOLDEN_LABELS.model_dump(mode="json")
    assert files.read_labels().summaries["golden-x7"] == GOLDEN_LABELS
    assert any(labels_dir.iterdir())


def test_case_37_labels_for_unknown_summary_are_404(
    client: TestClient, calibration_data: Path
) -> None:
    response = client.put(f"{PREFIX}/labels/no-such-id", json=GOLDEN_LABELS.model_dump(mode="json"))

    assert response.status_code == 404


def test_case_38_labels_with_wrong_sentence_count_are_422(
    client: TestClient, calibration_data: Path
) -> None:
    response = client.put(f"{PREFIX}/labels/ai-q3", json=GOLDEN_LABELS.model_dump(mode="json"))

    assert response.status_code == 422


def test_case_39_pair_verdict_outside_the_pair_is_422(
    client: TestClient, calibration_data: Path
) -> None:
    response = client.put(f"{PREFIX}/pairs/source-1", json={"better_summary_id": "elsewhere-9"})

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("keyfacts", "status"),
    [
        pytest.param(["Alpha rose.", "Beta fell."], 200, id="rv5_same_keyfacts_saved_again"),
        pytest.param(["Alpha rose.", "Gamma held."], 409, id="rv5_changed_wording"),
        pytest.param(["Alpha rose."], 409, id="rv5_changed_count"),
    ],
)
def test_rv5_labelled_source_keeps_its_keyfacts(
    client: TestClient, calibration_data: Path, keyfacts: list[str], status: int
) -> None:
    client.put(f"{PREFIX}/labels/golden-x7", json=GOLDEN_LABELS.model_dump(mode="json"))

    response = client.put(f"{PREFIX}/keyfacts/source-1", json={"keyfacts": keyfacts})

    assert response.status_code == status
