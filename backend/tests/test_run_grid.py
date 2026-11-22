"""run_grid against a fake backend: login, import, one run at a time, judges only on request, report."""

import json
from pathlib import Path

import httpx
import pytest

from app.schemas.evaluation_set_api import EvaluationSetEntryImport, EvaluationSetImportRequest
from calibration import run_grid
from calibration.run_grid import (
    GridCellResult,
    ModelRef,
    authenticated_client,
    find_set,
    import_sets,
    print_failures,
    wait_for_run,
)

API_URL = "http://api.test"


class FakeBackend:
    """Sets and runs in memory; every run finishes on its second poll, with its last entry failed."""

    def __init__(self, set_names: list[str]) -> None:
        self.set_names = list(set_names)
        self.requests: list[tuple[str, str]] = []
        self.imported: list[dict] = []
        self.run_requests: list[dict] = []
        self.polls: dict[str, int] = {}
        self.run_finishes = True
        self.deepeval_outcome: dict = {"status": "completed", "error": None}
        self.runs_accepted: int | None = None  # later POST /runs get 500

    def handle(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        self.requests.append((request.method, path))
        sends_body = request.method == "POST" and request.content
        if sends_body and request.headers.get("content-type") != "application/json":
            return httpx.Response(422, json={"detail": "body is not JSON"})
        if path == "/auth/token":
            return httpx.Response(200, json={"token": "jwt"})
        if path == "/api/v1/research/evaluation-sets" and request.method == "GET":
            return httpx.Response(200, json=[_set_item(name) for name in self.set_names])
        if path == "/api/v1/research/evaluation-sets":
            body = json.loads(request.content)
            self.imported.append(body)
            return httpx.Response(200, json=_created_set(body["name"], len(body["entries"])))
        if path.endswith("/runs") and request.method == "POST":
            self.run_requests.append(json.loads(request.content))
            if self.runs_accepted is not None and len(self.polls) >= self.runs_accepted:
                return httpx.Response(500, json={"detail": "backend restarted"})
            run_id = f"run-{len(self.polls)}"
            self.polls[run_id] = 0
            return httpx.Response(
                200,
                json={
                    "evaluation_run_id": run_id,
                    "status": "pending",
                    "created_at": "2026-11-22T00:00:00Z",
                },
            )
        if path.endswith("/deepeval"):
            return httpx.Response(200, json={"status": "queued", "run_id": path.split("/")[-2]})
        if path.endswith("/entries"):
            return httpx.Response(
                200, json={"entries": [_entry("ok", None), _entry("bad", "boom")]}
            )
        run_id = path.rsplit("/", 1)[-1]
        self.polls[run_id] += 1
        finished = self.run_finishes and self.polls[run_id] >= 2
        status = "completed" if finished else "running"
        deepeval = self.deepeval_outcome if finished else None
        return httpx.Response(200, json=_run(run_id, status, deepeval))


def _set_item(name: str) -> dict:
    return {
        "evaluation_set_id": f"id-{name}",
        "name": name,
        "language": "pl" if name.endswith("psc") else "en",
        "entry_count": 12,
        "run_count": 0,
        "created_at": "2026-11-22T00:00:00Z",
        "entries_with_metrics": 0,
    }


def _created_set(name: str, entry_count: int) -> dict:
    return {
        "evaluation_set_id": f"id-{name}",
        "name": name,
        "language": "en",
        "entry_count": entry_count,
        "created_at": "2026-11-22T00:00:00Z",
    }


def _run(run_id: str, status: str, deepeval: dict | None) -> dict:
    return {
        "id": run_id,
        "evaluation_set_id": "id-a",
        "evaluation_set_name": "a",
        "model_provider": "ollama",
        "model_name": "qwen3.5:0.8b",
        "processing_strategy": "direct",
        "summary_spec": {},
        "language": "auto",
        "context_expansion_mode": "none",
        "status": status,
        "created_at": "2026-11-22T00:00:00Z",
        "entry_count": 2,
        "aggregate_metrics": {"deepeval": deepeval},
    }


def _entry(title: str, error: str | None) -> dict:
    return {
        "entry_id": title,
        "title": title,
        "url": f"doc://{title}",
        "golden_summary": "Summary.",
        "status": "failed" if error else "completed",
        "error": error,
    }


@pytest.fixture
def backend(monkeypatch: pytest.MonkeyPatch) -> FakeBackend:
    fake = FakeBackend(["a", "b"])
    real_client = httpx.Client

    def client_with_fake_backend(*args: object, **kwargs: object) -> httpx.Client:
        kwargs["transport"] = httpx.MockTransport(fake.handle)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "Client", client_with_fake_backend)
    monkeypatch.setattr(run_grid.time, "sleep", lambda _seconds: None)
    return fake


def _write_set_file(tmp_path: Path, name: str, compute_golden_metrics: bool) -> Path:
    path = tmp_path / f"{name}.json"
    entry = EvaluationSetEntryImport(
        input_text="Text.", golden_summary="Summary.", title="T", url="doc://1"
    )
    request = EvaluationSetImportRequest(
        name=name, entries=[entry], compute_golden_metrics=compute_golden_metrics
    )
    path.write_text(request.model_dump_json(), "utf-8")
    return path


def test_model_ref_splits_on_first_colon() -> None:
    assert ModelRef.parse("ollama:qwen3.5:0.8b") == ModelRef("ollama", "qwen3.5:0.8b")
    with pytest.raises(ValueError, match="PROVIDER:MODEL"):
        ModelRef.parse("qwen3.5")


def test_authenticated_client_fails_on_wrong_password(monkeypatch: pytest.MonkeyPatch) -> None:
    real_client = httpx.Client
    monkeypatch.setattr(
        httpx,
        "Client",
        lambda *args, **kwargs: real_client(
            *args, **kwargs, transport=httpx.MockTransport(lambda _request: httpx.Response(401))
        ),
    )

    with pytest.raises(httpx.HTTPStatusError, match="401"):
        authenticated_client(API_URL, "wrong")


def test_import_sets_rejects_an_existing_name(backend: FakeBackend, tmp_path: Path) -> None:
    client = authenticated_client(API_URL, "secret")
    files = [_write_set_file(tmp_path, "new", True), _write_set_file(tmp_path, "a", False)]

    with pytest.raises(ValueError, match="a set named a already exists"):
        import_sets(client, files)
    assert backend.imported == []


def test_import_sets_turns_golden_metrics_off(backend: FakeBackend, tmp_path: Path) -> None:
    client = authenticated_client(API_URL, "secret")

    import_sets(client, [_write_set_file(tmp_path, "new", True)])

    assert [body["compute_golden_metrics"] for body in backend.imported] == [False]


def test_find_set_rejects_missing_and_ambiguous_names(backend: FakeBackend) -> None:
    client = authenticated_client(API_URL, "secret")
    backend.set_names.append("a")

    with pytest.raises(ValueError, match="found 0"):
        find_set(client, "missing")
    with pytest.raises(ValueError, match="found 2"):
        find_set(client, "a")


def test_run_grid_starts_each_run_after_the_previous_one_finished(backend: FakeBackend) -> None:
    client = authenticated_client(API_URL, "secret")

    results = run_grid.run_grid(client, ["a", "b"], [ModelRef("ollama", "m")], ["direct"], False)

    run_traffic = [
        (method, path.rsplit("/", 1)[-1])
        for method, path in backend.requests
        if "/runs" in path and not path.endswith("/entries")
    ]
    assert run_traffic == [
        ("POST", "runs"),
        ("GET", "run-0"),
        ("GET", "run-0"),
        ("POST", "runs"),
        ("GET", "run-1"),
        ("GET", "run-1"),
    ]
    assert [result.status for result in results] == ["completed", "completed"]


def test_run_grid_skips_deepeval_without_the_flag(backend: FakeBackend) -> None:
    client = authenticated_client(API_URL, "secret")

    run_grid.run_grid(client, ["a"], [ModelRef("ollama", "m")], ["direct"], False)
    assert not any(path.endswith("/deepeval") for _method, path in backend.requests)

    run_grid.run_grid(client, ["a"], [ModelRef("ollama", "m")], ["direct"], True)
    assert ("POST", "/api/v1/research/runs/run-1/deepeval") in backend.requests


def test_wait_for_run_raises_after_timeout(
    backend: FakeBackend, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = authenticated_client(API_URL, "secret")
    backend.run_finishes = False
    backend.polls["stuck"] = 0
    clock = iter([0.0, 10.0, run_grid.RUN_TIMEOUT_SECONDS + 1.0])
    monkeypatch.setattr(run_grid.time, "monotonic", lambda: next(clock))

    with pytest.raises(TimeoutError, match="run stuck"):
        wait_for_run(client, "stuck")


def test_report_rows_and_failures(backend: FakeBackend, capsys: pytest.CaptureFixture[str]) -> None:
    client = authenticated_client(API_URL, "secret")
    backend.deepeval_outcome = {"status": "failed", "error": "no GEMINI_API_KEY\nTraceback ..."}
    results: list[GridCellResult] = run_grid.run_grid(
        client, ["a"], [ModelRef("ollama", "m")], ["direct"], True
    )

    print_failures(results)

    report = capsys.readouterr().out
    assert "| a | ollama:m | direct | run-0 | completed |" in report
    assert "| 1 | 1 | failed |" in report
    assert "- a / ollama:m / direct: bad: boom" in report
    assert "- a / ollama:m / direct: deepeval pass: no GEMINI_API_KEY Traceback ..." in report


def test_report_marks_deepeval_off_without_the_flag(
    backend: FakeBackend, capsys: pytest.CaptureFixture[str]
) -> None:
    client = authenticated_client(API_URL, "secret")

    run_grid.run_grid(client, ["a"], [ModelRef("ollama", "m")], ["direct"], False)

    assert "| 1 | 1 | off |" in capsys.readouterr().out


def test_finished_rows_are_printed_before_the_grid_aborts(
    backend: FakeBackend, capsys: pytest.CaptureFixture[str]
) -> None:
    client = authenticated_client(API_URL, "secret")
    backend.runs_accepted = 1

    with pytest.raises(httpx.HTTPStatusError, match="500"):
        run_grid.run_grid(client, ["a", "b"], [ModelRef("ollama", "m")], ["direct"], False)

    assert "| a | ollama:m | direct | run-0 | completed |" in capsys.readouterr().out


def test_run_grid_runs_a_repeated_set_once(backend: FakeBackend) -> None:
    client = authenticated_client(API_URL, "secret")

    results = run_grid.run_grid(client, ["a", "a"], [ModelRef("ollama", "m")], ["direct"], False)

    assert [result.set_name for result in results] == ["a"]


def test_run_grid_asks_for_summaries_in_the_set_language(backend: FakeBackend) -> None:
    client = authenticated_client(API_URL, "secret")
    backend.set_names.append("psc")

    run_grid.run_grid(client, ["a", "psc"], [ModelRef("ollama", "m")], ["direct"], False)

    assert [body["language"] for body in backend.run_requests] == ["en", "pl"]
