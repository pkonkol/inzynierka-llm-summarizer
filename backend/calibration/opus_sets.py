"""E3 reference summaries by Claude Opus through `claude -p`: one fresh call per source and spec, then evaluation set files."""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

import structlog
from pydantic import BaseModel, TypeAdapter

from app.schemas.evaluation_set_api import EvaluationSetEntryImport, EvaluationSetImportRequest
from app.schemas.summary import LlmSummaryRequest
from app.schemas.summary_spec import MatchReferenceLength, SummarySpec, resolve_target_length
from app.services.calibration_files import REPO_ROOT
from app.services.llm._base import SummaryOutput
from app.services.llm.direct import prompt_with_params
from app.services.llm.presets import SUMMARY_PRESETS
from calibration.build_e3_subsets import read_set, set_data_dir, smoke_file, subset_file, write_set

log = structlog.get_logger(__name__)

E3_SETS: tuple[str, ...] = ("cnn_dailymail", "curation", "gumsum", "psc")
SPEC_NAMES: list[str] = ["e3", *SUMMARY_PRESETS]
RAW_DIR = REPO_ROOT / "data" / "opus_raw"
GENERATOR_PROVIDER = "claude-code"
GENERATOR_MODEL = "claude-opus-5-5"
CLAUDE_TIMEOUT_SECONDS = 600
USAGE_FIELDS = (
    "input_tokens",
    "cache_creation_input_tokens",
    "cache_read_input_tokens",
    "output_tokens",
)


class OpusPrompt(BaseModel):
    system: str
    user: str


class ClaudeAnswer(BaseModel):
    summary: str
    model: str
    usage: dict[str, int]
    duration_ms: int


class OpusRecord(BaseModel):
    url: str
    spec_name: str
    system: str
    user: str
    summary: str
    model: str
    usage: dict[str, int]
    duration_ms: int
    claude_version: str
    created_at: datetime

    @classmethod
    def from_answer(
        cls, url: str, spec_name: str, prompt: OpusPrompt, answer: ClaudeAnswer, claude_version: str
    ) -> OpusRecord:
        return cls(
            url=url,
            spec_name=spec_name,
            system=prompt.system,
            user=prompt.user,
            summary=answer.summary,
            model=answer.model,
            usage=answer.usage,
            duration_ms=answer.duration_ms,
            claude_version=claude_version,
            created_at=datetime.now(UTC),
        )


_RECORDS = TypeAdapter(list[OpusRecord])


# sources and prompts


def spec_for(spec_name: str) -> SummarySpec:
    if spec_name == "e3":
        return SummarySpec(length=MatchReferenceLength())
    return SUMMARY_PRESETS[spec_name].spec


def source_order(
    subset: EvaluationSetImportRequest, smoke: EvaluationSetImportRequest
) -> list[EvaluationSetEntryImport]:
    """Smoke entries first (balanced across lengths, genres and PSC cells), then the rest of the subset in file order."""
    smoke_urls = {entry.url for entry in smoke.entries}
    rest = [entry for entry in subset.entries if entry.url not in smoke_urls]
    return [*smoke.entries, *rest]


def ordered_sources(set_name: str) -> tuple[str, list[EvaluationSetEntryImport]]:
    """The subset's language and its sources in the one order both generate and build_sets use."""
    subset = read_set(subset_file(set_name))
    return subset.language, source_order(subset, read_set(smoke_file(set_name)))


def opus_request(
    entry: EvaluationSetEntryImport, spec: SummarySpec, language: str
) -> LlmSummaryRequest:
    length = resolve_target_length(
        spec.length, input_words=len(entry.input_text.split()), golden_summary=entry.golden_summary
    )
    return LlmSummaryRequest(
        text=entry.input_text,
        source_url=entry.url,
        model_provider=GENERATOR_PROVIDER,
        model_name=GENERATOR_MODEL,
        language=language,
        spec=spec,
        length=length,
        related_sources=[],
    )


def opus_prompt(request: LlmSummaryRequest) -> OpusPrompt:
    """`claude -p` takes one system prompt and one user turn, so the human messages are joined."""
    prompt, params = prompt_with_params(request)
    messages = prompt.format_messages(**params)
    system = [str(message.content) for message in messages if message.type == "system"]
    human = [str(message.content) for message in messages if message.type == "human"]
    only_system_and_human = len(system) + len(human) == len(messages)
    if len(system) != 1 or not only_system_and_human:
        raise ValueError(f"expected one system message and human messages, got {messages!r}")
    return OpusPrompt(system=system[0], user="\n\n".join(human))


# claude -p call


def claude_command(prompt: OpusPrompt) -> list[str]:
    return [
        "claude",
        "-p",
        "--model",
        GENERATOR_MODEL,
        "--effort",
        "high",
        "--system-prompt",
        prompt.system,
        "--tools",
        "",  # no built-in tools: the call is a plain completion like the backend's
        "--setting-sources",
        "",  # no user/project settings, so CLAUDE.md, memory and the repo's hooks stay out of the call
        "--disable-slash-commands",
        "--no-session-persistence",
        "--output-format",
        "json",
        "--json-schema",
        json.dumps(SummaryOutput.model_json_schema()),
        prompt.user,
    ]


def parse_claude_output(stdout: str, duration_ms: int) -> ClaudeAnswer:
    result = json.loads(stdout)
    if result["is_error"]:
        raise ValueError(f"claude reported an error: {stdout[:500]}")
    if "structured_output" not in result:
        raise ValueError(f"claude answered without structured output: {stdout[:500]}")
    answering_models = list(result["modelUsage"])  # a helper model may report usage next to Opus
    if GENERATOR_MODEL not in answering_models:
        raise ValueError(f"{GENERATOR_MODEL} did not answer, models that did: {answering_models}")
    usage = {field: int(result["usage"][field]) for field in USAGE_FIELDS}
    return ClaudeAnswer(
        summary=result["structured_output"]["summary"],
        model=GENERATOR_MODEL,
        usage=usage,
        duration_ms=duration_ms,
    )


def summarize_with_claude(prompt: OpusPrompt) -> ClaudeAnswer:
    started = time.monotonic()
    with tempfile.TemporaryDirectory() as empty_dir:
        completed = subprocess.run(
            claude_command(prompt),
            capture_output=True,
            text=True,
            cwd=empty_dir,  # the working directory's environment details would enter the context
            timeout=CLAUDE_TIMEOUT_SECONDS,
        )
    if completed.returncode != 0:
        raise RuntimeError(
            f"claude exited with {completed.returncode}: {completed.stderr.strip() or completed.stdout[:500]}"
        )
    duration_ms = round((time.monotonic() - started) * 1000)
    return parse_claude_output(completed.stdout, duration_ms)


def installed_claude_version() -> str:
    completed = subprocess.run(["claude", "--version"], check=True, capture_output=True, text=True)
    return completed.stdout.strip()


# raw records file


def raw_file(raw_dir: Path, set_name: str, spec_name: str) -> Path:
    return raw_dir / f"{set_name}__{spec_name}.json"


def read_records(path: Path) -> list[OpusRecord]:
    if not path.exists():
        return []
    return _RECORDS.validate_json(path.read_bytes())


def write_records(path: Path, records: list[OpusRecord]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_bytes(_RECORDS.dump_json(records, indent=2))
    temporary.replace(path)


def set_prompts(set_name: str, spec_name: str) -> dict[str, OpusPrompt]:
    """The prompt for every source of the set, by url, in source order."""
    spec = spec_for(spec_name)
    language, sources = ordered_sources(set_name)
    return {entry.url: opus_prompt(opus_request(entry, spec, language)) for entry in sources}


def _assert_same_prompts(records: list[OpusRecord], prompts: dict[str, OpusPrompt]) -> None:
    """One set must not mix summaries written from two versions of the backend prompt."""
    for record in records:
        current = prompts[record.url]
        if (record.system, record.user) != (current.system, current.user):
            raise ValueError(
                f"{record.url} ({record.spec_name}) was written with a different prompt; "
                "move the raw file aside to regenerate the set"
            )


def _generate_set(set_name: str, spec_name: str, per_set: int, claude_version: str) -> int:
    prompts = set_prompts(set_name, spec_name)
    path = raw_file(RAW_DIR, set_name, spec_name)
    records = read_records(path)
    _assert_same_prompts(records, prompts)

    # resume: skip the sources already recorded
    done_urls = {record.url for record in records}
    todo = [url for url in list(prompts)[:per_set] if url not in done_urls]
    log.info(
        "opus set started", set_name=set_name, spec=spec_name, done=len(done_urls), todo=len(todo)
    )

    for url in todo:
        answer = summarize_with_claude(prompts[url])
        records.append(OpusRecord.from_answer(url, spec_name, prompts[url], answer, claude_version))
        write_records(path, records)
        log.info(
            "opus summary written",
            set_name=set_name,
            url=url,
            model=answer.model,
            duration_ms=answer.duration_ms,
            **answer.usage,
        )
    return len(todo)


# entry points


def generate(spec_name: str, per_set: int, claude_version: str) -> int:
    """Summarize the first `per_set` sources of every set, skipping those already recorded; returns the number of new summaries.

    The raw file is rewritten after every summary, so an interrupted run loses nothing already written.
    """
    if per_set < 1:
        raise ValueError(f"per_set must be at least 1, got {per_set}")
    return sum(_generate_set(set_name, spec_name, per_set, claude_version) for set_name in E3_SETS)


def opus_set_file(spec_name: str, set_name: str, count: int) -> Path:
    return set_data_dir(set_name) / f"evaluation_set_e3_opus_{spec_name}_{set_name}_{count}.json"


def build_sets(spec_name: str) -> list[Path]:
    """Evaluation set files whose golden summary is Opus's: the E3 entry with its human reference replaced.

    Every set's records are checked against the current prompts before any file is written.
    """
    records_by_set = {
        set_name: read_records(raw_file(RAW_DIR, set_name, spec_name)) for set_name in E3_SETS
    }
    for set_name, records in records_by_set.items():
        _assert_same_prompts(records, set_prompts(set_name, spec_name))

    paths = []
    for set_name, records in records_by_set.items():
        if not records:
            continue
        summaries = {record.url: record.summary for record in records}
        language, sources = ordered_sources(set_name)
        entries = [
            entry.model_copy(
                update={"golden_summary": summaries[entry.url], "golden_metrics": None}
            )
            for entry in sources
            if entry.url in summaries
        ]
        path = opus_set_file(spec_name, set_name, len(entries))
        path.parent.mkdir(parents=True, exist_ok=True)
        write_set(path, f"e3-opus-{spec_name}-{set_name}-{len(entries)}", language, entries)
        paths.append(path)
    return paths


def _positive_int(text: str) -> int:
    value = int(text)
    if value < 1:
        raise argparse.ArgumentTypeError(f"must be at least 1, got {value}")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)

    generate_command = subcommands.add_parser("generate", help="summarize sources with claude -p")
    generate_command.add_argument("--spec", choices=SPEC_NAMES, required=True)
    generate_command.add_argument(
        "--per-set",
        type=_positive_int,
        required=True,
        help="first N sources of every set: smoke-12 first, then the rest of E3-50",
    )

    build_command = subcommands.add_parser(
        "build-sets", help="evaluation set files from the records"
    )
    build_command.add_argument("--spec", choices=SPEC_NAMES, required=True)

    args = parser.parse_args()
    if args.command == "generate":
        written = generate(args.spec, args.per_set, installed_claude_version())
        print(f"{written} new summaries for spec {args.spec}")
    else:
        for path in build_sets(args.spec):
            print(path)


if __name__ == "__main__":
    main()
