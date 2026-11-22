"""Create E3 evaluation runs through the backend API: import set files, then one run per set x model x strategy."""

from __future__ import annotations

import argparse
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import get_args

import httpx
import structlog

from app.core.config import settings
from app.schemas.evaluation_run_api import (
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


def find_set_id(client: httpx.Client, set_name: str) -> str:
    """Exactly one set with that name, or ValueError."""
    matches = [
        evaluation_set for evaluation_set in _list_sets(client) if evaluation_set.name == set_name
    ]
    if len(matches) != 1:
        raise ValueError(f"expected one set named {set_name}, found {len(matches)}")
    return matches[0].evaluation_set_id


def run_grid(
    client: httpx.Client,
    set_names: list[str],
    models: list[ModelRef],
    strategies: list[ProcessingStrategy],
    with_judges: bool,
) -> list[GridCellResult]:
    """Runs one after another, so Ollama serves one run at a time and each duration means something."""
    set_ids = {set_name: find_set_id(client, set_name) for set_name in set_names}
    results: list[GridCellResult] = []
    for set_name, set_id in set_ids.items():
        for model in models:
            for strategy in strategies:
                results.append(
                    _run_one_cell(client, set_name, set_id, model, strategy, with_judges)
                )
    return results


def _run_one_cell(
    client: httpx.Client,
    set_name: str,
    set_id: str,
    model: ModelRef,
    strategy: ProcessingStrategy,
    with_judges: bool,
) -> GridCellResult:
    started = time.monotonic()
    run_id = start_run(client, set_id, model, strategy)
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

    if with_judges and run.status == "completed":
        run_deepeval(client, run_id)

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
    )


def start_run(
    client: httpx.Client, set_id: str, model: ModelRef, strategy: ProcessingStrategy
) -> str:
    request = EvaluationRunCreateRequest(
        model_provider=model.provider, model_name=model.name, processing_strategy=strategy
    )
    response = client.post(
        f"{RESEARCH_API}/evaluation-sets/{set_id}/runs", json=request.model_dump(mode="json")
    )
    response.raise_for_status()
    return EvaluationRunCreateResponse.model_validate_json(response.content).evaluation_run_id


def wait_for_run(client: httpx.Client, run_id: str) -> EvaluationRunResponse:
    """Poll until completed/failed; TimeoutError after RUN_TIMEOUT_SECONDS."""
    return _poll_run(client, run_id, lambda run: run.status in FINISHED_STATUSES)


def run_deepeval(client: httpx.Client, run_id: str) -> None:
    """POST /runs/{id}/deepeval and poll aggregate_metrics.deepeval until it finishes."""
    client.post(f"{RESEARCH_API}/runs/{run_id}/deepeval").raise_for_status()
    _poll_run(client, run_id, _deepeval_finished)


def fetch_entries(client: httpx.Client, run_id: str) -> list[EvaluationRunEntryResponse]:
    response = client.get(f"{RESEARCH_API}/runs/{run_id}/entries")
    response.raise_for_status()
    return EvaluationRunEntriesResponse.model_validate_json(response.content).entries


def print_report(results: list[GridCellResult]) -> None:
    """Markdown: a row per run (set, model, strategy, seconds, completed, failed), then each failed entry's title and error."""
    print("| set | model | strategy | run | status | seconds | completed | failed |")
    print("|---|---|---|---|---|---|---|---|")
    for result in results:
        print(
            f"| {result.set_name} | {result.model} | {result.strategy} | {result.run_id} "
            f"| {result.status} | {result.seconds:.0f} | {result.completed_entries} "
            f"| {len(result.failed_entries)} |"
        )

    failures = [(result, entry) for result in results for entry in result.failed_entries]
    if not failures:
        return
    print("\nFailed entries:\n")
    for result, entry in failures:
        print(
            f"- {result.set_name} / {result.model} / {result.strategy}: {entry.title}: {entry.error}"
        )


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
    grid_command.add_argument("--judges", action="store_true", help="GEval pass after each run")
    for command in (import_command, grid_command):
        command.add_argument("--api-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()

    client = authenticated_client(args.api_url, settings.auth_secret.get_secret_value())
    if args.command == "import":
        import_sets(client, args.set_files)
        return
    print_report(run_grid(client, args.sets, args.models, args.strategies, args.judges))


if __name__ == "__main__":
    main()
