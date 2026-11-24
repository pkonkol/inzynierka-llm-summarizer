"""Opus summaries of the E3 subsets: source order, the backend's own prompt, the claude call, resumable generation, evaluation set files."""

import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.schemas.evaluation_set_api import EvaluationSetEntryImport, EvaluationSetImportRequest
from app.schemas.summary_spec import MatchReferenceLength, SummarySpec, resolve_target_length
from app.services.llm._base import SummaryOutput
from app.services.llm._prompts import EXTRACT_FROM_CONTENT
from app.services.llm.direct import prompt_with_params
from app.services.llm.presets import SUMMARY_PRESETS
from calibration import opus_sets
from calibration.opus_sets import (
    GENERATOR_MODEL,
    ClaudeAnswer,
    OpusPrompt,
    OpusRecord,
    build_sets,
    claude_command,
    generate,
    opus_prompt,
    opus_request,
    ordered_sources,
    parse_claude_output,
    raw_file,
    read_records,
    source_order,
    spec_for,
    summarize_with_claude,
    write_records,
)

CLAUDE_VERSION = "9.9.9 (test)"


def _entry(index: int, golden_words: int = 5, input_words: int = 300) -> EvaluationSetEntryImport:
    return EvaluationSetEntryImport(
        input_text=" ".join(f"src{index}w{word}" for word in range(input_words)),
        golden_summary=" ".join(f"gold{index}w{word}" for word in range(golden_words)),
        title=f"Title {index}",
        url=f"https://example.test/{index}",
    )


def _set(
    name: str, entries: list[EvaluationSetEntryImport], language: str = "en"
) -> EvaluationSetImportRequest:
    return EvaluationSetImportRequest(name=name, language=language, entries=entries)


def _write_set(path: Path, request: EvaluationSetImportRequest) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(request.model_dump_json(), "utf-8")


def _urls(entries: list[EvaluationSetEntryImport]) -> list[str]:
    return [entry.url for entry in entries]


def _fake_answer(prompt: OpusPrompt) -> ClaudeAnswer:
    return ClaudeAnswer(
        summary=f"Opus summary of: {prompt.user[:20]}",
        model=GENERATOR_MODEL,
        usage={"input_tokens": 10, "output_tokens": 5},
        duration_ms=1234,
    )


def _record(url: str, spec_name: str = "e3", summary: str = "S") -> OpusRecord:
    return OpusRecord(
        url=url,
        spec_name=spec_name,
        system="sys",
        user="usr",
        summary=summary,
        model=GENERATOR_MODEL,
        usage={"input_tokens": 1},
        duration_ms=1,
        claude_version=CLAUDE_VERSION,
        created_at=datetime(2026, 11, 23, tzinfo=UTC),
    )


@pytest.fixture
def source_sets(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, list[str]]:
    """Two sets: E3-5 files plus smoke-2 files in tmp_path; returns the url order expected per set."""
    monkeypatch.setattr(opus_sets, "E3_SETS", ("cnn_dailymail", "psc"))
    monkeypatch.setattr(opus_sets, "RAW_DIR", tmp_path / "raw")
    subset_paths: dict[str, Path] = {}
    smoke_paths: dict[str, Path] = {}
    for set_name, language in (("cnn_dailymail", "en"), ("psc", "pl")):
        entries = [_entry(index) for index in range(5)]
        subset_paths[set_name] = tmp_path / "subsets" / f"{set_name}.json"
        smoke_paths[set_name] = tmp_path / "smoke" / f"{set_name}.json"
        _write_set(subset_paths[set_name], _set(f"e3-{set_name}-5", entries, language))
        _write_set(
            smoke_paths[set_name],
            _set(f"e3-{set_name}-smoke", [entries[3], entries[1]], language),
        )
    monkeypatch.setattr(opus_sets, "subset_file", lambda set_name: subset_paths[set_name])
    monkeypatch.setattr(opus_sets, "smoke_file", lambda set_name: smoke_paths[set_name])
    order = [f"https://example.test/{index}" for index in (3, 1, 0, 2, 4)]
    return {"cnn_dailymail": order, "psc": order}


@pytest.fixture
def claude_calls(monkeypatch: pytest.MonkeyPatch) -> list[OpusPrompt]:
    """Replaces the claude call with a fake answer; returns the prompts it received."""
    prompts: list[OpusPrompt] = []

    def fake_summarize(prompt: OpusPrompt) -> ClaudeAnswer:
        prompts.append(prompt)
        return _fake_answer(prompt)

    monkeypatch.setattr(opus_sets, "summarize_with_claude", fake_summarize)
    return prompts


@pytest.fixture
def raw_dir(tmp_path: Path) -> Path:
    return tmp_path / "raw"


def _only_sets(monkeypatch: pytest.MonkeyPatch, *set_names: str) -> None:
    monkeypatch.setattr(opus_sets, "E3_SETS", set_names)


def _matching_record(set_name: str, language: str, index: int) -> OpusRecord:
    entry = _entry(index)
    prompt = opus_prompt(opus_request(entry, spec_for("e3"), language))
    return OpusRecord.from_answer(entry.url, "e3", prompt, _fake_answer(prompt), CLAUDE_VERSION)


# --- specs ---


def test_spec_for_preset_returns_the_preset_spec() -> None:
    assert spec_for("key_points") == SUMMARY_PRESETS["key_points"].spec


def test_spec_for_e3_matches_the_reference_length() -> None:
    assert spec_for("e3") == SummarySpec(length=MatchReferenceLength())


def test_spec_for_unknown_name_raises() -> None:
    with pytest.raises((KeyError, ValueError)):
        spec_for("no_such_spec")


# --- source order ---


def test_source_order_puts_smoke_entries_first_in_smoke_order() -> None:
    entries = [_entry(index) for index in range(5)]

    ordered = source_order(_set("subset", entries), _set("smoke", [entries[3], entries[1]]))

    assert _urls(ordered)[:2] == [entries[3].url, entries[1].url]


def test_source_order_continues_with_remaining_entries_in_file_order() -> None:
    entries = [_entry(index) for index in range(5)]

    ordered = source_order(_set("subset", entries), _set("smoke", [entries[3], entries[1]]))

    assert _urls(ordered)[2:] == [entries[0].url, entries[2].url, entries[4].url]


def test_source_order_repeats_no_entry() -> None:
    entries = [_entry(index) for index in range(5)]

    ordered = source_order(_set("subset", entries), _set("smoke", [entries[3], entries[1]]))

    assert len(set(_urls(ordered))) == len(ordered) == 5


def test_source_order_identifies_entries_by_url() -> None:
    entries = [_entry(index) for index in range(3)]
    smoke_copy = entries[2].model_copy(update={"title": "different title"})

    ordered = source_order(_set("subset", entries), _set("smoke", [smoke_copy]))

    assert _urls(ordered) == [entries[2].url, entries[0].url, entries[1].url]


# --- the prompt ---


def test_opus_request_for_e3_takes_length_from_the_golden_summary() -> None:
    request = opus_request(_entry(0, golden_words=42), spec_for("e3"), "en")

    assert request.length.target_words == 42


def test_opus_request_for_preset_derives_length_from_input_words() -> None:
    short_input = opus_request(_entry(0, golden_words=42, input_words=100), spec_for("facts"), "en")
    long_input = opus_request(_entry(0, golden_words=42, input_words=5000), spec_for("facts"), "en")

    assert short_input.length.target_words != 42
    assert long_input.length.target_words > short_input.length.target_words


@pytest.mark.parametrize("spec_name", list(SUMMARY_PRESETS))
def test_opus_request_preset_length_equals_the_resolved_preset_length(spec_name: str) -> None:
    entry = _entry(0, golden_words=42, input_words=1234)

    request = opus_request(entry, spec_for(spec_name), "en")

    expected = resolve_target_length(
        SUMMARY_PRESETS[spec_name].spec.length, input_words=1234, golden_summary=None
    )
    assert request.length.target_words == expected.target_words
    assert request.length.target_sentences == expected.target_sentences


def test_opus_request_has_the_claude_model_and_no_related_sources() -> None:
    request = opus_request(_entry(0), spec_for("e3"), "pl")

    assert (request.model_provider, request.model_name) == ("claude-code", GENERATOR_MODEL)
    assert request.related_sources == []
    assert request.language == "pl"


def test_opus_request_carries_the_entry_text_and_url() -> None:
    entry = _entry(7)

    request = opus_request(entry, spec_for("e3"), "en")

    assert request.text == entry.input_text
    assert request.source_url == entry.url


def test_opus_prompt_contains_the_source_text_and_length_guidance() -> None:
    entry = _entry(0, golden_words=42)

    prompt = opus_prompt(opus_request(entry, spec_for("e3"), "en"))

    assert entry.input_text in prompt.user
    assert "Write approximately 42 words" in prompt.user


def test_opus_prompt_equals_the_backend_direct_prompt() -> None:
    request = opus_request(_entry(0, golden_words=42), spec_for("e3"), "en")
    template, params = prompt_with_params(request)
    messages = EXTRACT_FROM_CONTENT.format_messages(**params)

    prompt = opus_prompt(request)

    assert template is EXTRACT_FROM_CONTENT
    assert prompt.system == messages[0].content
    assert prompt.user == "\n\n".join(str(message.content) for message in messages[1:])


def test_opus_prompt_system_message_has_the_language_instruction() -> None:
    polish = opus_prompt(opus_request(_entry(0), spec_for("e3"), "pl"))
    english = opus_prompt(opus_request(_entry(0), spec_for("e3"), "en"))

    assert polish.system != english.system


# --- the claude call ---


def test_claude_command_runs_claude_print_mode_with_the_prompt_last() -> None:
    prompt = OpusPrompt(system="the system text", user="the user text")

    command = claude_command(prompt)

    assert command[:2] == ["claude", "-p"]
    assert command[-1] == "the user text"


def test_claude_command_passes_the_system_prompt_and_isolation_flags() -> None:
    command = claude_command(OpusPrompt(system="the system text", user="u"))

    def value_after(flag: str) -> str:
        return command[command.index(flag) + 1]

    assert value_after("--system-prompt") == "the system text"
    assert value_after("--model") == "claude-opus-5-5"
    assert value_after("--effort") == "high"
    assert value_after("--tools") == ""
    assert value_after("--setting-sources") == ""
    assert value_after("--output-format") == "json"
    assert "--disable-slash-commands" in command
    assert "--no-session-persistence" in command


def test_claude_command_asks_for_the_summary_output_schema() -> None:
    command = claude_command(OpusPrompt(system="s", user="u"))

    schema = command[command.index("--json-schema") + 1]

    assert schema == json.dumps(SummaryOutput.model_json_schema())


def _claude_stdout(**overrides: object) -> str:
    result: dict[str, object] = {
        "type": "result",
        "is_error": False,
        "structured_output": {"summary": "A short summary."},
        "modelUsage": {"claude-opus-5-5": {"inputTokens": 11, "outputTokens": 44}},
        "usage": {
            "input_tokens": 11,
            "cache_creation_input_tokens": 22,
            "cache_read_input_tokens": 33,
            "output_tokens": 44,
            "service_tier": "standard",
        },
    }
    result.update(overrides)
    return json.dumps(result)


def test_parse_claude_output_reads_summary_usage_and_duration() -> None:
    answer = parse_claude_output(_claude_stdout(), 4321)

    assert answer.summary == "A short summary."
    assert answer.usage == {
        "input_tokens": 11,
        "cache_creation_input_tokens": 22,
        "cache_read_input_tokens": 33,
        "output_tokens": 44,
    }
    assert answer.duration_ms == 4321


def test_parse_claude_output_reports_the_generator_model() -> None:
    assert parse_claude_output(_claude_stdout(), 1).model == GENERATOR_MODEL


def test_parse_claude_output_accepts_a_helper_model_next_to_the_generator() -> None:
    stdout = _claude_stdout(modelUsage={"claude-haiku-5": {}, GENERATOR_MODEL: {}})

    assert parse_claude_output(stdout, 1).model == GENERATOR_MODEL


def test_parse_claude_output_raises_naming_the_models_when_the_generator_is_absent() -> None:
    stdout = _claude_stdout(modelUsage={"claude-haiku-5": {}, "claude-sonnet-5": {}})

    with pytest.raises(ValueError, match="claude-haiku-5") as error:
        parse_claude_output(stdout, 1)

    assert "claude-sonnet-5" in str(error.value)


def test_parse_claude_output_raises_without_any_model() -> None:
    with pytest.raises(ValueError):
        parse_claude_output(_claude_stdout(modelUsage={}), 1)


def test_summarize_with_claude_raises_with_stderr_on_a_failing_process(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, object]] = []

    def failing_run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(kwargs)
        return subprocess.CompletedProcess(
            args=["claude"], returncode=1, stdout="", stderr="usage limit reached"
        )

    monkeypatch.setattr(opus_sets.subprocess, "run", failing_run)

    with pytest.raises(RuntimeError, match="usage limit reached"):
        summarize_with_claude(OpusPrompt(system="s", user="u"))

    assert calls[0]["timeout"]


def test_parse_claude_output_raises_on_an_error_result() -> None:
    with pytest.raises(ValueError):
        parse_claude_output(_claude_stdout(is_error=True), 1)


def test_parse_claude_output_raises_without_structured_output() -> None:
    stdout = json.loads(_claude_stdout())
    del stdout["structured_output"]

    with pytest.raises(ValueError):
        parse_claude_output(json.dumps(stdout), 1)


# --- records files ---


def test_raw_file_is_named_after_set_and_spec(tmp_path: Path) -> None:
    assert raw_file(tmp_path, "gumsum", "facts") == tmp_path / "gumsum__facts.json"


def test_read_records_of_a_missing_file_is_empty(tmp_path: Path) -> None:
    assert read_records(tmp_path / "missing.json") == []


def test_record_from_answer_carries_prompt_answer_and_metadata() -> None:
    prompt = OpusPrompt(system="the system", user="the user")
    answer = ClaudeAnswer(
        summary="Sum", model="claude-opus-5-5", usage={"output_tokens": 3}, duration_ms=77
    )

    record = OpusRecord.from_answer("https://x.test/1", "facts", prompt, answer, CLAUDE_VERSION)

    assert (record.url, record.spec_name) == ("https://x.test/1", "facts")
    assert (record.system, record.user) == ("the system", "the user")
    assert (record.summary, record.model) == ("Sum", "claude-opus-5-5")
    assert (record.usage, record.duration_ms) == ({"output_tokens": 3}, 77)
    assert record.claude_version == CLAUDE_VERSION


def test_records_survive_a_write_and_read(tmp_path: Path) -> None:
    path = tmp_path / "records.json"
    records = [_record("u1"), _record("u2", summary="Other")]

    write_records(path, records)

    assert read_records(path) == records


# --- generate ---


def test_generate_writes_one_record_per_source_in_order(
    source_sets: dict[str, list[str]], claude_calls: list[OpusPrompt], raw_dir: Path
) -> None:
    created = generate("e3", 3, CLAUDE_VERSION)

    records = read_records(raw_file(raw_dir, "cnn_dailymail", "e3"))
    assert created == 6  # three per set, two sets
    assert [record.url for record in records] == source_sets["cnn_dailymail"][:3]


def test_generate_keeps_a_raw_file_per_set_and_spec(
    source_sets: dict[str, list[str]], claude_calls: list[OpusPrompt], raw_dir: Path
) -> None:
    generate("topics", 2, CLAUDE_VERSION)

    assert len(read_records(raw_file(raw_dir, "cnn_dailymail", "topics"))) == 2
    assert len(read_records(raw_file(raw_dir, "psc", "topics"))) == 2


def test_generate_record_stores_prompt_answer_and_metadata(
    source_sets: dict[str, list[str]],
    claude_calls: list[OpusPrompt],
    raw_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _only_sets(monkeypatch, "psc")

    generate("facts", 1, CLAUDE_VERSION)

    (record,) = read_records(raw_file(raw_dir, "psc", "facts"))
    assert record.spec_name == "facts"
    assert record.claude_version == CLAUDE_VERSION
    assert record.summary.startswith("Opus summary of:")
    assert record.usage == {"input_tokens": 10, "output_tokens": 5}
    assert record.duration_ms == 1234
    assert record.model == GENERATOR_MODEL
    assert record.user.startswith("Generate summary from the content.")
    assert "src3w0" in record.user  # the first source in order is entry 3
    assert record.system.startswith("You are an expert content summarizer.")


def test_generate_sends_the_prompt_the_backend_would_build(
    source_sets: dict[str, list[str]],
    claude_calls: list[OpusPrompt],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _only_sets(monkeypatch, "psc")

    generate("e3", 1, CLAUDE_VERSION)

    entry = _entry(3, golden_words=5)  # first in order; the fixture builds every entry the same way
    assert claude_calls == [opus_prompt(opus_request(entry, spec_for("e3"), "pl"))]


def test_generate_skips_urls_already_in_the_raw_file(
    source_sets: dict[str, list[str]],
    claude_calls: list[OpusPrompt],
    raw_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _only_sets(monkeypatch, "cnn_dailymail")

    first = generate("e3", 2, CLAUDE_VERSION)
    second = generate("e3", 4, CLAUDE_VERSION)
    third = generate("e3", 4, CLAUDE_VERSION)

    records = read_records(raw_file(raw_dir, "cnn_dailymail", "e3"))
    assert (first, second, third) == (2, 2, 0)
    assert len(claude_calls) == 4
    assert [record.url for record in records] == source_sets["cnn_dailymail"][:4]


def test_generate_stops_on_a_failing_call_and_keeps_earlier_records(
    source_sets: dict[str, list[str]],
    raw_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _only_sets(monkeypatch, "cnn_dailymail")
    calls: list[OpusPrompt] = []

    def fails_on_third(prompt: OpusPrompt) -> ClaudeAnswer:
        calls.append(prompt)
        if len(calls) == 3:
            raise RuntimeError("claude failed")
        return _fake_answer(prompt)

    monkeypatch.setattr(opus_sets, "summarize_with_claude", fails_on_third)

    with pytest.raises(RuntimeError, match="claude failed"):
        generate("e3", 5, CLAUDE_VERSION)

    records = read_records(raw_file(raw_dir, "cnn_dailymail", "e3"))
    assert len(calls) == 3
    assert [record.url for record in records] == source_sets["cnn_dailymail"][:2]


def test_generate_writes_the_raw_file_after_every_summary(
    source_sets: dict[str, list[str]], raw_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _only_sets(monkeypatch, "psc")
    saved_before_each_call: list[int] = []

    def watching(prompt: OpusPrompt) -> ClaudeAnswer:
        saved_before_each_call.append(len(read_records(raw_file(raw_dir, "psc", "e3"))))
        return _fake_answer(prompt)

    monkeypatch.setattr(opus_sets, "summarize_with_claude", watching)

    generate("e3", 3, CLAUDE_VERSION)

    assert saved_before_each_call == [0, 1, 2]


def test_generate_refuses_a_stored_prompt_that_differs_and_leaves_the_file_alone(
    source_sets: dict[str, list[str]],
    claude_calls: list[OpusPrompt],
    raw_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _only_sets(monkeypatch, "psc")
    path = raw_file(raw_dir, "psc", "e3")
    write_records(path, [_record(source_sets["psc"][0])])  # "sys"/"usr" never match the real prompt
    before = path.read_bytes()

    with pytest.raises(ValueError):
        generate("e3", 3, CLAUDE_VERSION)

    assert claude_calls == []
    assert path.read_bytes() == before


def test_generate_refuses_a_stale_record_beyond_per_set(
    source_sets: dict[str, list[str]],
    claude_calls: list[OpusPrompt],
    raw_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _only_sets(monkeypatch, "psc")
    path = raw_file(raw_dir, "psc", "e3")
    write_records(path, [_record(source_sets["psc"][4])])  # fifth in order, outside per_set=2
    before = path.read_bytes()

    with pytest.raises(ValueError):
        generate("e3", 2, CLAUDE_VERSION)

    assert claude_calls == []
    assert path.read_bytes() == before


def test_generate_accepts_a_matching_record_beyond_per_set(
    source_sets: dict[str, list[str]],
    claude_calls: list[OpusPrompt],
    raw_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _only_sets(monkeypatch, "psc")
    path = raw_file(raw_dir, "psc", "e3")
    write_records(path, [_matching_record("psc", "pl", 4)])  # fifth in order, outside per_set=2

    created = generate("e3", 2, CLAUDE_VERSION)

    assert created == 2
    assert source_sets["psc"][4] in [record.url for record in read_records(path)]


@pytest.mark.parametrize("per_set", [0, -1])
def test_generate_rejects_a_per_set_below_one(
    source_sets: dict[str, list[str]], claude_calls: list[OpusPrompt], per_set: int
) -> None:
    with pytest.raises(ValueError):
        generate("e3", per_set, CLAUDE_VERSION)

    assert claude_calls == []


def test_cli_rejects_per_set_zero(
    source_sets: dict[str, list[str]],
    claude_calls: list[OpusPrompt],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(sys, "argv", ["opus_sets", "generate", "--spec", "e3", "--per-set", "0"])

    with pytest.raises(SystemExit):
        opus_sets.main()

    assert claude_calls == []


# --- ordered_sources ---


def test_ordered_sources_returns_sources_in_source_order(
    source_sets: dict[str, list[str]],
) -> None:
    _, sources = ordered_sources("psc")

    assert _urls(sources) == source_sets["psc"]


@pytest.mark.parametrize(("set_name", "language"), [("cnn_dailymail", "en"), ("psc", "pl")])
def test_ordered_sources_returns_the_set_language(
    source_sets: dict[str, list[str]], set_name: str, language: str
) -> None:
    returned_language, _ = ordered_sources(set_name)

    assert returned_language == language


# --- build_sets ---


@pytest.fixture
def opus_outputs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    out_dir = tmp_path / "out"
    monkeypatch.setattr(
        opus_sets,
        "opus_set_file",
        lambda spec_name, set_name, count: out_dir / f"{spec_name}_{set_name}_{count}.json",
    )
    return out_dir


def _built(path: Path) -> EvaluationSetImportRequest:
    return EvaluationSetImportRequest.model_validate_json(path.read_text("utf-8"))


def test_build_sets_replaces_golden_summary_and_keeps_other_fields(
    source_sets: dict[str, list[str]],
    claude_calls: list[OpusPrompt],
    raw_dir: Path,
    opus_outputs: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _only_sets(monkeypatch, "cnn_dailymail")
    generate("e3", 3, CLAUDE_VERSION)
    records = read_records(raw_file(raw_dir, "cnn_dailymail", "e3"))

    (path,) = build_sets("e3")

    built = _built(path)
    originals = {entry.url: entry for entry in (_entry(index) for index in range(5))}
    assert len(built.entries) == 3
    for entry, record in zip(built.entries, records, strict=True):
        original = originals[entry.url]
        assert entry.golden_summary == record.summary
        assert entry.input_text == original.input_text
        assert entry.title == original.title
        assert entry.url == record.url
        assert entry.golden_metrics is None


def test_build_sets_names_the_set_after_spec_set_and_entry_count(
    source_sets: dict[str, list[str]],
    claude_calls: list[OpusPrompt],
    opus_outputs: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _only_sets(monkeypatch, "cnn_dailymail")
    generate("facts", 4, CLAUDE_VERSION)

    (path,) = build_sets("facts")

    assert _built(path).name == "e3-opus-facts-cnn_dailymail-4"


@pytest.mark.parametrize(("set_name", "language"), [("cnn_dailymail", "en"), ("psc", "pl")])
def test_build_sets_takes_language_from_the_subset_and_skips_golden_metrics(
    source_sets: dict[str, list[str]],
    claude_calls: list[OpusPrompt],
    opus_outputs: Path,
    monkeypatch: pytest.MonkeyPatch,
    set_name: str,
    language: str,
) -> None:
    _only_sets(monkeypatch, set_name)
    generate("e3", 2, CLAUDE_VERSION)

    (path,) = build_sets("e3")

    built = _built(path)
    assert built.language == language
    assert built.compute_golden_metrics is False


def test_build_sets_keeps_the_source_order(
    source_sets: dict[str, list[str]],
    claude_calls: list[OpusPrompt],
    opus_outputs: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _only_sets(monkeypatch, "cnn_dailymail")
    generate("e3", 5, CLAUDE_VERSION)

    (path,) = build_sets("e3")

    assert _urls(_built(path).entries) == source_sets["cnn_dailymail"]


def test_build_sets_skips_a_set_without_records(
    source_sets: dict[str, list[str]],
    claude_calls: list[OpusPrompt],
    opus_outputs: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _only_sets(monkeypatch, "psc")
    generate("e3", 2, CLAUDE_VERSION)
    _only_sets(monkeypatch, "cnn_dailymail", "psc")

    paths = build_sets("e3")

    assert [path.name for path in paths] == ["e3_psc_2.json"]


def test_build_sets_refuses_a_stored_prompt_that_differs_and_writes_no_set_file(
    source_sets: dict[str, list[str]],
    claude_calls: list[OpusPrompt],
    raw_dir: Path,
    opus_outputs: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _only_sets(monkeypatch, "cnn_dailymail")
    generate("e3", 2, CLAUDE_VERSION)
    _only_sets(monkeypatch, "cnn_dailymail", "psc")
    write_records(raw_file(raw_dir, "psc", "e3"), [_record(source_sets["psc"][0])])

    with pytest.raises(ValueError):
        build_sets("e3")

    assert not opus_outputs.exists() or list(opus_outputs.iterdir()) == []


def test_opus_set_file_lives_in_data_for_english_and_data_psc_for_polish() -> None:
    english = opus_sets.opus_set_file("facts", "gumsum", 12)
    polish = opus_sets.opus_set_file("facts", "psc", 12)

    assert english.name == "evaluation_set_e3_opus_facts_gumsum_12.json"
    assert polish.name == "evaluation_set_e3_opus_facts_psc_12.json"
    assert polish.parent == english.parent / "psc"
