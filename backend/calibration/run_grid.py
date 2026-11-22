"""Create E3 evaluation runs through the backend API: import set files, then one run per set x model x strategy."""

from __future__ import annotations

import argparse
import itertools
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import get_args

import httpx
import structlog

from app.core.config import settings
from app.schemas.evaluation_run_api import (
    DeepevalPassMetrics,
    EvaluationRunCreateRequest,
    EvaluationRunCreateResponse,
    EvaluationRunEntriesResponse,
    EvaluationRunEntryResponse,
    EvaluationRunResponse,
    RunStatus,
)
from app.schemas.evaluation_set_api import (
    EvaluationSetCreateResponse,
    EvaluationSetImportRequest,
    EvaluationSetListItemResponse,
)
from app.schemas.summary_spec import ProcessingStrategy

log = structlog.get_logger(__name__)

RESEARCH_API = "/api/v1/research"
POLL_INTERVAL_SECONDS = 10
RUN_TIMEOUT_SECONDS = 3600
FINISHED_STATUSES = frozenset({"completed", "failed"})


@dataclass(frozen=True)
class ModelRef:
    provider: str
    name: str

    @classmethod
    def parse(cls, text: str) -> ModelRef:
        """`ollama:qwen3.5:0.8b` → provider `ollama`, name `qwen3.5:0.8b` (split on the first colon)."""
        provider, separator, name = text.partition(":")
        if not separator or not provider or not name:
            raise ValueError(f"expected PROVIDER:MODEL, got {text!r}")
        return cls(provider=provider, name=name)

    def __str__(self) -> str:
        return f"{self.provider}:{self.name}"


@dataclass(frozen=True)
class GridCellResult:
    set_name: str
    model: ModelRef
    strategy: ProcessingStrategy
    run_id: str
    status: RunStatus
    seconds: float
    completed_entries: int
    failed_entries: list[EvaluationRunEntryResponse]
    deepeval: DeepevalPassMetrics | None  # None when the run was made without --deepeval


def authenticated_client(api_url: str, password: str) -> httpx.Client:
    """Client with the bearer token from POST /auth/token."""
    client = httpx.Client(base_url=api_url, timeout=60)
    response = client.post("/auth/token", json={"password": password})
    response.raise_for_status()
    client.headers["Authorization"] = f"Bearer {response.json()['token']}"
    return client


def import_sets(client: httpx.Client, set_files: list[Path]) -> None:
    """POST each file to /evaluation-sets with compute_golden_metrics forced off; an existing name is an error."""
    existing_names = {evaluation_set.name for evaluation_set in _list_sets(client)}
    requests = {path: _read_set_file(path) for path in set_files}
    for path, request in requests.items():
        if request.name in existing_names:
            raise ValueError(f"{path}: a set named {request.name} already exists")

    for request in requests.values():
        response = client.post(
            f"{RESEARCH_API}/evaluation-sets", json=request.model_dump(mode="json")
        )
        response.raise_for_status()
        created = EvaluationSetCreateResponse.model_validate_json(response.content)
        log.info(
            "evaluation set imported",
            set_name=created.name,
            entries=created.entry_count,
            set_id=created.evaluation_set_id,
        )


def find_set(client: httpx.Client, set_name: str) -> EvaluationSetListItemResponse:
    """Exactly one set with that name, or ValueError."""
    matches = [
        evaluation_set for evaluation_set in _list_sets(client) if evaluation_set.name == set_name
    ]
    if len(matches) != 1:
        raise ValueError(f"expected one set named {set_name}, found {len(matches)}")
    return matches[0]


def run_grid(
    client: httpx.Client,
    set_names: list[str],
    models: list[ModelRef],
    strategies: list[ProcessingStrategy],
    with_deepeval: bool,
) -> list[GridCellResult]:
    """Runs one after another, so Ollama serves one run at a time and each duration means something.

    Each report row is printed as soon as its run ends, so an aborted grid keeps the finished rows.
    """
    evaluation_sets = [find_set(client, set_name) for set_name in dict.fromkeys(set_names)]
    print_report_header()
    results: list[GridCellResult] = []
    for evaluation_set, model, strategy in itertools.product(evaluation_sets, models, strategies):
        result = _run_one_cell(client, evaluation_set, model, strategy, with_deepeval)
        print_report_row(result)
        results.append(result)
    return results


def _run_one_cell(
    client: httpx.Client,
    evaluation_set: EvaluationSetListItemResponse,
    model: ModelRef,
    strategy: ProcessingStrategy,
    with_deepeval: bool,
) -> GridCellResult:
    set_name = evaluation_set.name
    started = time.monotonic()
    run_id = start_run(client, evaluation_set, model, strategy)
    log.info(
        "evaluation run started",
        set_name=set_name,
        model=str(model),
        strategy=strategy,
        run_id=run_id,
    )
    run = wait_for_run(client, run_id)
    seconds = time.monotonic() - started
    log.info(
        "evaluation run finished",
        set_name=set_name,
        model=str(model),
        strategy=strategy,
        run_id=run_id,
        status=run.status,
        duration_ms=round(seconds * 1000),
    )

    deepeval = run_deepeval(client, run_id) if with_deepeval and run.status == "completed" else None

    entries = fetch_entries(client, run_id)
    return GridCellResult(
        set_name=set_name,
        model=model,
        strategy=strategy,
        run_id=run_id,
        status=run.status,
        seconds=seconds,
        completed_entries=sum(1 for entry in entries if entry.status == "completed"),
        failed_entries=[entry for entry in entries if entry.status == "failed"],
        deepeval=deepeval,
    )


def start_run(
    client: httpx.Client,
    evaluation_set: EvaluationSetListItemResponse,
    model: ModelRef,
    strategy: ProcessingStrategy,
) -> str:
    """Summaries in the set's language, the same one its ROUGE is computed in."""
    request = EvaluationRunCreateRequest(
        model_provider=model.provider,
        model_name=model.name,
        processing_strategy=strategy,
        language=evaluation_set.language,
    )
    response = client.post(
        f"{RESEARCH_API}/evaluation-sets/{evaluation_set.evaluation_set_id}/runs",
        json=request.model_dump(mode="json"),
    )
    response.raise_for_status()
    return EvaluationRunCreateResponse.model_validate_json(response.content).evaluation_run_id


def wait_for_run(client: httpx.Client, run_id: str) -> EvaluationRunResponse:
    """Poll until completed/failed; TimeoutError after RUN_TIMEOUT_SECONDS."""
    return _poll_run(client, run_id, lambda run: run.status in FINISHED_STATUSES)


def run_deepeval(client: httpx.Client, run_id: str) -> DeepevalPassMetrics:
    """POST /runs/{id}/deepeval and poll aggregate_metrics.deepeval until it finishes."""
    client.post(f"{RESEARCH_API}/runs/{run_id}/deepeval").raise_for_status()
    run = _poll_run(client, run_id, _deepeval_finished)
    if run.aggregate_metrics.deepeval is None:
        raise RuntimeError(f"run {run_id}: deepeval pass finished without a status")
    return run.aggregate_metrics.deepeval


def fetch_entries(client: httpx.Client, run_id: str) -> list[EvaluationRunEntryResponse]:
    response = client.get(f"{RESEARCH_API}/runs/{run_id}/entries")
    response.raise_for_status()
    return EvaluationRunEntriesResponse.model_validate_json(response.content).entries


def print_report_header() -> None:
    print("| set | model | strategy | run | status | seconds | completed | failed | deepeval |")
    print("|---|---|---|---|---|---|---|---|---|")


def print_report_row(result: GridCellResult) -> None:
    deepeval_status = "off" if result.deepeval is None else result.deepeval.status
    print(
        f"| {result.set_name} | {result.model} | {result.strategy} | {result.run_id} "
        f"| {result.status} | {result.seconds:.0f} | {result.completed_entries} "
        f"| {len(result.failed_entries)} | {deepeval_status} |"
    )


def print_failures(results: list[GridCellResult]) -> None:
    """Each failed entry's title and error, then each failed deepeval pass."""
    entry_failures = [(result, entry) for result in results for entry in result.failed_entries]
    deepeval_failures = [
        result for result in results if result.deepeval and result.deepeval.status == "failed"
    ]
    if not entry_failures and not deepeval_failures:
        return
    print("\nFailures:\n")
    for result, entry in entry_failures:
        print(f"- {_cell_label(result)}: {entry.title}: {_one_line(entry.error)}")
    for result in deepeval_failures:
        print(f"- {_cell_label(result)}: deepeval pass: {_one_line(result.deepeval.error)}")


def _cell_label(result: GridCellResult) -> str:
    return f"{result.set_name} / {result.model} / {result.strategy}"


def _one_line(text: str | None) -> str:
    """Multi-line provider errors would break the markdown list."""
    return " ".join(str(text).split())


def _poll_run(
    client: httpx.Client, run_id: str, is_done: Callable[[EvaluationRunResponse], bool]
) -> EvaluationRunResponse:
    deadline = time.monotonic() + RUN_TIMEOUT_SECONDS
    while True:
        response = client.get(f"{RESEARCH_API}/runs/{run_id}")
        response.raise_for_status()
        run = EvaluationRunResponse.model_validate_json(response.content)
        if is_done(run):
            return run
        if time.monotonic() > deadline:
            raise TimeoutError(
                f"run {run_id} unfinished after {RUN_TIMEOUT_SECONDS} s ({run.status})"
            )
        time.sleep(POLL_INTERVAL_SECONDS)


def _deepeval_finished(run: EvaluationRunResponse) -> bool:
    deepeval = run.aggregate_metrics.deepeval
    return deepeval is not None and deepeval.status in FINISHED_STATUSES


def _list_sets(client: httpx.Client) -> list[EvaluationSetListItemResponse]:
    response = client.get(f"{RESEARCH_API}/evaluation-sets")
    response.raise_for_status()
    return [EvaluationSetListItemResponse.model_validate(item) for item in response.json()]


def _read_set_file(path: Path) -> EvaluationSetImportRequest:
    request = EvaluationSetImportRequest.model_validate_json(path.read_text("utf-8"))
    return request.model_copy(update={"compute_golden_metrics": False})


def main() -> None:
    """argparse subcommands `import` and `grid`."""
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)

    import_command = subcommands.add_parser("import", help="import evaluation set files")
    import_command.add_argument("set_files", nargs="+", type=Path)

    grid_command = subcommands.add_parser("grid", help="one run per set x model x strategy")
    grid_command.add_argument("--sets", nargs="+", required=True, help="evaluation set names")
    grid_command.add_argument(
        "--models", nargs="+", required=True, type=ModelRef.parse, help="PROVIDER:MODEL"
    )
    grid_command.add_argument(
        "--strategies", nargs="+", default=["direct"], choices=get_args(ProcessingStrategy)
    )
    grid_command.add_argument(
        "--deepeval", action="store_true", help="deepeval (G-Eval) metrics after each completed run"
    )
    for command in (import_command, grid_command):
        command.add_argument("--api-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()

    client = authenticated_client(args.api_url, settings.auth_secret.get_secret_value())
    if args.command == "import":
        import_sets(client, args.set_files)
        return
    print_failures(run_grid(client, args.sets, args.models, args.strategies, args.deepeval))


if __name__ == "__main__":
    main()
