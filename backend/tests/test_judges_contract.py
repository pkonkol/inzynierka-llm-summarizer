# ruff: noqa: ANN401, S105  # the fake Mongo walks untyped documents; "token" is a path segment
"""Acceptance criteria of the calibrated judge pass: endpoint, resumable per-judge storage, shared key facts and golden judgements, aggregates."""

import copy
import sys
from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import settings
from app.routers import evaluation_runs as evaluation_runs_router
from app.schemas.evaluation_run_api import EvaluationRunEntryResponse
from app.schemas.judges import (
    AlignmentJudgement,
    CoherenceJudgement,
    CoherenceResult,
    FactLevelResult,
    FactLevelScores,
    FaithfulnessJudgement,
    SummaryJudgement,
)
from app.schemas.shared_metrics import DeepevalItem
from app.schemas.usage import UsageMetadata
from app.services.evaluation_run_metrics import aggregate_run_judgements, run_judge_pass
from app.services.llm import LlmOutputError
from app.services.metrics import judge_summary
from app.services.metrics.deepeval import DeepEvalMetricResult
from app.services.metrics.fact_level_judges import (
    JUDGE_CALIBRATION,
    KEYFACT_MODEL,
    MAIN_JUDGE,
    SECOND_JUDGE,
    JudgeModelRef,
)

MAIN_ID = MAIN_JUDGE.model_id()
SECOND_ID = SECOND_JUDGE.model_id()
PREFIX = "/api/v1/research"
SET_ID = "607f1f77bcf86cd799439001"
SOURCE_TEXT = "Alpha rose. Beta fell. Gamma held."
GOLDEN_TEXT = "Alpha rose and beta fell."
KEYFACTS = ["Alpha rose.", "Beta fell."]
SUMMARY_STATISTICS = {"char_count": 10, "flesch_kincaid_grade": 1.0, "length_ratio": 0.3}
CROSS_STATISTICS = {"rouge1": 0.1, "rouge2": 0.1, "rougeL": 0.1, "meteor": 0.1}


# ---------------------------------------------------------------- in-memory Mongo at the edge


def _values_at(node: Any, tokens: list[str]) -> list[Any]:
    """Every value a dotted path reaches, fanning out over arrays the way Mongo does."""
    if not tokens:
        return [node]
    if isinstance(node, list):
        return [value for item in node for value in _values_at(item, tokens)]
    if isinstance(node, dict):
        return _values_at(node.get(tokens[0]), tokens[1:])
    return [None]


def _condition_holds(value: Any, condition: Any) -> bool:
    if not (isinstance(condition, dict) and any(key.startswith("$") for key in condition)):
        return value == condition
    for operator, operand in condition.items():
        if operator == "$nin" and value in operand:
            return False
        if operator == "$in" and value not in operand:
            return False
        if operator == "$ne" and value == operand:
            return False
        if operator == "$lt" and not (value is not None and value < operand):
            return False
        if operator == "$exists" and (value is not None) != operand:
            return False
        if operator not in {"$nin", "$in", "$ne", "$lt", "$exists"}:
            raise NotImplementedError(f"fake mongo: operator {operator}")
    return True


def _matches(document: dict, query: dict) -> bool:
    for key, condition in query.items():
        if key == "$or":
            if not any(_matches(document, branch) for branch in condition):
                return False
        elif key == "$and":
            if not all(_matches(document, branch) for branch in condition):
                return False
        elif not any(
            _condition_holds(value, condition) for value in _values_at(document, key.split("."))
        ):
            return False
    return True


def _first_matching_index(document: dict, query: dict) -> int | None:
    array_conditions = {
        key.removeprefix("entries."): condition
        for key, condition in query.items()
        if key.startswith("entries.")
    }
    for index, element in enumerate(document.get("entries", [])):
        if _matches(element, array_conditions):
            return index
    return None


def _walk(
    node: Any, tokens: list[str], positional_index: int | None, array_filters: list[dict]
) -> Iterator[tuple[Any, Any]]:
    """Yields (container, key) for every place a possibly positional update path points at."""
    token, rest = tokens[0], tokens[1:]
    if token == "$":
        keys = [positional_index]
    elif token.startswith("$["):
        name = token[2:-1]
        element_filters = {
            key.split(".", 1)[1]: condition
            for array_filter in array_filters
            for key, condition in array_filter.items()
            if key.split(".", 1)[0] == name
        }
        keys = [i for i, element in enumerate(node) if _matches(element, element_filters)]
    elif isinstance(node, list):
        keys = [int(token)]
    else:
        keys = [token]
    for key in keys:
        if not rest:
            yield node, key
            continue
        if isinstance(node, dict) and not isinstance(node.get(key), (dict, list)):
            node[key] = {}
        yield from _walk(node[key], rest, positional_index, array_filters)


class FakeCollection:
    """Just enough of the PyMongo async collection API for the judge pass and the run endpoints."""

    def __init__(self, documents: list[dict]) -> None:
        self.documents = documents

    async def find_one(self, query: dict, projection: dict | None = None) -> dict | None:
        for document in self.documents:
            if not _matches(document, query):
                continue
            result = copy.deepcopy(document)
            if projection and "entries.$" in projection:
                index = _first_matching_index(document, query)
                result["entries"] = [result["entries"][index]]
            return result
        return None

    async def aggregate(self, pipeline: list[dict]) -> FakeCursor:
        found = [
            {**copy.deepcopy(document), "entry_count": len(document.get("entries", []))}
            for document in self.documents
            if _matches(document, pipeline[0]["$match"])
        ]
        return FakeCursor(found)

    async def update_one(
        self, query: dict, update: dict, array_filters: list[dict] | None = None, **_: Any
    ) -> SimpleNamespace:
        for document in self.documents:
            if _matches(document, query):
                self._apply(document, query, update, array_filters or [])
                return SimpleNamespace(matched_count=1, modified_count=1)
        return SimpleNamespace(matched_count=0, modified_count=0)

    def _apply(self, document: dict, query: dict, update: dict, array_filters: list[dict]) -> None:
        index = _first_matching_index(document, query)
        for operator, fields in update.items():
            for path, value in fields.items():
                for container, key in _walk(document, path.split("."), index, array_filters):
                    self._apply_field(container, key, operator, copy.deepcopy(value))

    @staticmethod
    def _apply_field(container: Any, key: Any, operator: str, value: Any) -> None:
        if operator == "$set":
            container[key] = value
        elif operator == "$unset":
            container.pop(key, None)
        elif operator == "$push":
            container.setdefault(key, [])
            container[key].extend(value["$each"] if "$each" in value else [value])
        elif operator == "$pull":
            container[key] = [
                item
                for item in container[key]
                if not all(item.get(field) == wanted for field, wanted in value.items())
            ]
        else:
            raise NotImplementedError(f"fake mongo: update operator {operator}")


class FakeCursor:
    def __init__(self, documents: list[dict]) -> None:
        self.documents = documents

    async def to_list(self, length: int | None = None) -> list[dict]:
        return self.documents


def _patch_everywhere(monkeypatch: pytest.MonkeyPatch, name: str, replacement: Any) -> None:
    """Replaces `name` in every app module that imported it, wherever the implementation put its import."""
    for module_name, module in list(sys.modules.items()):
        if module_name.startswith("app.") and hasattr(module, name):
            monkeypatch.setattr(module, name, replacement)


# ---------------------------------------------------------------- builders


def _fact_level(
    judge_id: str,
    faithfulness: float = 1.0,
    completeness: float = 1.0,
    conciseness: float = 1.0,
    has_repetition: bool = False,
) -> FactLevelResult:
    return FactLevelResult(
        scores=FactLevelScores(
            faithfulness=faithfulness,
            completeness=completeness,
            conciseness=conciseness,
            has_repetition=has_repetition,
            repeated_sentence_indices=[],
        ),
        faithfulness=FaithfulnessJudgement(sentences=[]),
        alignment=AlignmentJudgement(keyfacts=[]),
        judge_model=judge_id,
        prompt_version="v1+v1",
        usage=UsageMetadata(),
    )


def _coherence(judge_id: str, coherent: bool = True) -> CoherenceResult:
    return CoherenceResult(
        judgement=CoherenceJudgement(coherent=coherent, reason="r"),
        judge_model=judge_id,
        prompt_version="v1",
        usage=UsageMetadata(),
    )


def _summarization_metric(judge_id: str, score: float = 0.8) -> DeepevalItem:
    return DeepevalItem(
        name="Summarization", score=score, passed=True, reason="r", judge_model=judge_id
    )


def _summarization_result(judge_id: str, score: float = 0.8) -> DeepEvalMetricResult:
    return DeepEvalMetricResult(
        name="Summarization",
        score=score,
        reason="r",
        passed=True,
        judge_model=judge_id,
        rubric_version="v1",
    )


def _judgement(judge_id: str, **fact_level_scores: float | bool) -> SummaryJudgement:
    return SummaryJudgement(
        judge_model=judge_id,
        fact_level=_fact_level(judge_id, **fact_level_scores),
        coherence=_coherence(judge_id),
        summarization_metric=_summarization_metric(judge_id),
        error=None,
    )


def _unusable_judgement(judge_id: str) -> dict:
    return SummaryJudgement(
        judge_model=judge_id,
        fact_level=None,
        coherence=None,
        summarization_metric=None,
        error="judge answered with garbage",
    ).model_dump(mode="json")


def _dump(judgement: SummaryJudgement) -> dict:
    return judgement.model_dump(mode="json")


def _pairwise_item(judge_id: str, score: float) -> dict:
    return {"name": "Pairwise", "score": score, "reason": "r", "judge_model": judge_id}


def _set_entry(entry_id: str, golden: str | None = GOLDEN_TEXT, **extra: Any) -> dict:
    return {
        "entry_id": entry_id,
        "input_text": SOURCE_TEXT,
        "golden_summary": golden,
        "title": f"title {entry_id}",
        "url": f"https://example.com/{entry_id}",
        **extra,
    }


def _run_entry(
    entry_id: str,
    status: str = "completed",
    golden: str | None = GOLDEN_TEXT,
    judges: list[dict] | None = None,
    pairwise: list[dict] | None = None,
) -> dict:
    return {
        "entry_id": entry_id,
        "status": status,
        "golden_summary": golden,
        "ai_summary": f"AI summary of {entry_id}." if status == "completed" else None,
        "ai_metrics": (
            {"summary": SUMMARY_STATISTICS, "judges": judges or []}
            if status == "completed"
            else None
        ),
        "cross_metrics": (  # an entry without a golden summary has nothing to compare with
            {**CROSS_STATISTICS, "pairwise": pairwise or []}
            if status == "completed" and golden is not None
            else None
        ),
    }


def _run_document(
    entries: list[dict], status: str = "completed", judges_status: dict | None = None
) -> dict:
    aggregate_metrics: dict = {"entry_count": len(entries)}
    if judges_status is not None:
        aggregate_metrics["judges"] = judges_status
    return {
        "_id": ObjectId(),
        "evaluation_set_id": SET_ID,
        "evaluation_set_name": "set",
        "model_provider": "gemini",
        "model_name": "gemini-3.8-flash",
        "processing_strategy": "direct",
        "summary_spec": {},
        "language": "en",
        "context_expansion_mode": "none",
        "status": status,
        "created_at": datetime.now(UTC),
        "aggregate_metrics": aggregate_metrics,
        "entries": entries,
    }


def _set_document(entries: list[dict]) -> dict:
    return {"_id": ObjectId(SET_ID), "name": "set", "language": "en", "entries": entries}


# ---------------------------------------------------------------- fixtures


@pytest.fixture
def mongo(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    runs = FakeCollection([])
    sets = FakeCollection([])
    _patch_everywhere(monkeypatch, "get_evaluation_runs_collection", lambda: runs)
    _patch_everywhere(monkeypatch, "get_evaluation_sets_collection", lambda: sets)
    return SimpleNamespace(runs=runs, sets=sets)


@pytest.fixture
def judge_calls(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    """Replaces the LLM-backed collaborators of the pass; every call is recorded."""
    calls: list[dict] = []

    async def fake_judge_summary(
        source_text: str, summary: str, keyfacts: list[str], language: str, judge: JudgeModelRef
    ) -> SummaryJudgement:
        calls.append(
            {
                "kind": "judge_summary",
                "source_text": source_text,
                "summary": summary,
                "keyfacts": keyfacts,
                "language": language,
                "judge": judge.model_id(),
            }
        )
        return _judgement(judge.model_id())

    async def fake_extract_keyfacts(
        source_text: str, language: str, judge: JudgeModelRef
    ) -> list[str]:
        calls.append({"kind": "extract_keyfacts", "judge": judge.model_id()})
        return list(KEYFACTS)

    async def fake_pairwise(
        judge: JudgeModelRef, source_text: str, ai_summary: str, golden_summary: str
    ) -> dict:
        calls.append({"kind": "pairwise", "judge": judge.model_id()})
        return _pairwise_item(judge.model_id(), 0.9)

    _patch_everywhere(monkeypatch, "judge_summary", fake_judge_summary)
    _patch_everywhere(monkeypatch, "extract_keyfacts", fake_extract_keyfacts)
    _patch_everywhere(monkeypatch, "evaluate_pairwise_cross_deepeval", fake_pairwise)
    return calls


def _seed(mongo: SimpleNamespace, run_entries: list[dict], set_entries: list[dict]) -> str:
    run = _run_document(run_entries)
    mongo.runs.documents.append(run)
    if not mongo.sets.documents:
        mongo.sets.documents.append(_set_document(set_entries))
    return str(run["_id"])


def _stored_run_entry(mongo: SimpleNamespace, run_id: str, entry_id: str) -> dict:
    run = next(doc for doc in mongo.runs.documents if str(doc["_id"]) == run_id)
    return next(entry for entry in run["entries"] if entry["entry_id"] == entry_id)


def _stored_set_entry(mongo: SimpleNamespace, entry_id: str) -> dict:
    return next(e for e in mongo.sets.documents[0]["entries"] if e["entry_id"] == entry_id)


def _stored_judges(mongo: SimpleNamespace, run_id: str, entry_id: str) -> list[dict]:
    return _stored_run_entry(mongo, run_id, entry_id)["ai_metrics"]["judges"]


# ---------------------------------------------------------------- pass: coverage and resumability


async def test_judge_pass_stores_a_judgement_on_every_completed_entry(
    mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    run_id = _seed(
        mongo,
        [_run_entry("e1"), _run_entry("e2"), _run_entry("e3", status="failed")],
        [_set_entry("e1"), _set_entry("e2"), _set_entry("e3")],
    )

    await run_judge_pass(run_id, MAIN_ID)

    for entry_id in ("e1", "e2"):
        judges = _stored_judges(mongo, run_id, entry_id)
        assert [judge["judge_model"] for judge in judges] == [MAIN_ID]
    assert _stored_run_entry(mongo, run_id, "e3")["ai_metrics"] is None


async def test_judge_pass_reports_updated_skipped_and_already_scored_entries(
    mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    run_id = _seed(
        mongo,
        [
            _run_entry("e1"),
            _run_entry("e2", golden=None, judges=[_dump(_judgement(MAIN_ID))]),
            _run_entry("e3", status="failed"),
        ],
        [_set_entry("e1"), _set_entry("e2", golden=None), _set_entry("e3")],
    )

    await run_judge_pass(run_id, MAIN_ID)

    status = mongo.runs.documents[0]["aggregate_metrics"]["judges"]
    assert status["status"] == "completed"
    assert (
        status["updated_entries"],
        status["skipped_entries"],
        status["already_scored_entries"],
    ) == (
        1,
        1,
        1,
    )


async def test_judge_pass_hands_source_summary_keyfacts_language_and_judge_to_the_judge(
    mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    run_id = _seed(mongo, [_run_entry("e1")], [_set_entry("e1")])

    await run_judge_pass(run_id, SECOND_ID)

    ai_call = next(
        call
        for call in judge_calls
        if call["kind"] == "judge_summary" and call["summary"] == "AI summary of e1."
    )
    assert ai_call["source_text"] == SOURCE_TEXT
    assert ai_call["keyfacts"] == KEYFACTS
    assert ai_call["language"] == "en"
    assert ai_call["judge"] == SECOND_ID


async def test_judge_pass_skips_an_entry_this_judge_already_judged(
    mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    existing = _dump(_judgement(MAIN_ID, faithfulness=0.25))
    run_id = _seed(
        mongo,
        [_run_entry("e1", golden=None, judges=[existing])],
        [_set_entry("e1", golden=None)],
    )

    await run_judge_pass(run_id, MAIN_ID)

    assert [call for call in judge_calls if call["kind"] == "judge_summary"] == []
    assert _stored_judges(mongo, run_id, "e1") == [existing]


async def test_a_judgement_with_error_counts_as_judged_and_is_not_retried(
    mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    unusable = _unusable_judgement(MAIN_ID)
    run_id = _seed(
        mongo,
        [_run_entry("e1", golden=None, judges=[unusable])],
        [_set_entry("e1", golden=None)],
    )

    await run_judge_pass(run_id, MAIN_ID)

    assert [call for call in judge_calls if call["kind"] == "judge_summary"] == []
    assert _stored_judges(mongo, run_id, "e1") == [unusable]


async def test_a_pairwise_answer_that_cannot_be_used_stores_no_pairwise_item(
    monkeypatch: pytest.MonkeyPatch, mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    async def unusable_pairwise(
        judge: JudgeModelRef, source_text: str, ai_summary: str, golden_summary: str
    ) -> dict:
        raise LlmOutputError("no score", "raw")

    _patch_everywhere(monkeypatch, "evaluate_pairwise_cross_deepeval", unusable_pairwise)
    run_id = _seed(mongo, [_run_entry("e1")], [_set_entry("e1")])

    await run_judge_pass(run_id, MAIN_ID)

    entry = _stored_run_entry(mongo, run_id, "e1")
    assert [judge["judge_model"] for judge in entry["ai_metrics"]["judges"]] == [MAIN_ID]
    assert entry["cross_metrics"]["pairwise"] == []


async def test_force_leaves_the_golden_judgements_on_the_set_untouched(
    mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    stored_golden = _dump(_judgement(MAIN_ID, faithfulness=0.25))
    run_id = _seed(
        mongo,
        [_run_entry("e1", judges=[_dump(_judgement(MAIN_ID))])],
        [_set_entry("e1", golden_judges=[stored_golden])],
    )

    await run_judge_pass(run_id, MAIN_ID, force=True)

    assert _stored_set_entry(mongo, "e1")["golden_judges"] == [stored_golden]
    assert [c for c in judge_calls if c.get("summary") == GOLDEN_TEXT] == []


async def test_a_second_judge_is_added_next_to_the_first_one(
    mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    first_judges_result = _dump(_judgement(MAIN_ID, faithfulness=0.25))
    run_id = _seed(
        mongo,
        [
            _run_entry(
                "e1",
                judges=[first_judges_result],
                pairwise=[_pairwise_item(MAIN_ID, 0.7)],
            )
        ],
        [_set_entry("e1")],
    )

    await run_judge_pass(run_id, SECOND_ID)

    entry = _stored_run_entry(mongo, run_id, "e1")
    judges = entry["ai_metrics"]["judges"]
    assert sorted(judge["judge_model"] for judge in judges) == sorted([MAIN_ID, SECOND_ID])
    assert first_judges_result in judges
    pairwise_judges = [item["judge_model"] for item in entry["cross_metrics"]["pairwise"]]
    assert sorted(pairwise_judges) == sorted([MAIN_ID, SECOND_ID])


async def test_force_replaces_only_this_judges_results(
    mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    stale_main = _unusable_judgement(MAIN_ID)
    second = _dump(_judgement(SECOND_ID, faithfulness=0.5))
    run_id = _seed(
        mongo,
        [
            _run_entry(
                "e1",
                judges=[stale_main, second],
                pairwise=[_pairwise_item(MAIN_ID, 0.1), _pairwise_item(SECOND_ID, 0.6)],
            )
        ],
        [_set_entry("e1")],
    )

    await run_judge_pass(run_id, MAIN_ID, force=True)

    entry = _stored_run_entry(mongo, run_id, "e1")
    main_results = [j for j in entry["ai_metrics"]["judges"] if j["judge_model"] == MAIN_ID]
    assert len(main_results) == 1
    assert main_results[0]["fact_level"]["scores"]["faithfulness"] == 1.0  # fresh judgement
    assert second in entry["ai_metrics"]["judges"]
    pairwise = entry["cross_metrics"]["pairwise"]
    assert [item["score"] for item in pairwise if item["judge_model"] == SECOND_ID] == [0.6]
    assert [item["score"] for item in pairwise if item["judge_model"] == MAIN_ID] == [0.9]


# ---------------------------------------------------------------- pass: key facts and golden judgement


async def test_keyfacts_are_extracted_once_and_stored_on_the_set_entry(
    mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    first_run = _seed(mongo, [_run_entry("e1")], [_set_entry("e1")])
    second_run = _seed(mongo, [_run_entry("e1")], [])

    await run_judge_pass(first_run, MAIN_ID)
    await run_judge_pass(second_run, MAIN_ID)

    extractions = [call for call in judge_calls if call["kind"] == "extract_keyfacts"]
    assert [call["judge"] for call in extractions] == [KEYFACT_MODEL.model_id()]
    assert _stored_set_entry(mongo, "e1")["keyfacts"] == {
        "keyfacts": KEYFACTS,
        "model": KEYFACT_MODEL.model_id(),
    }


async def test_stored_keyfacts_are_used_without_extracting_again(
    mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    stored = {"keyfacts": ["Stored fact."], "model": KEYFACT_MODEL.model_id()}
    run_id = _seed(mongo, [_run_entry("e1")], [_set_entry("e1", keyfacts=stored)])

    await run_judge_pass(run_id, MAIN_ID)

    assert [call for call in judge_calls if call["kind"] == "extract_keyfacts"] == []
    summary_calls = [call for call in judge_calls if call["kind"] == "judge_summary"]
    assert summary_calls
    assert all(call["keyfacts"] == ["Stored fact."] for call in summary_calls)


async def test_golden_summary_is_judged_once_per_judge_and_stored_on_the_set_entry(
    mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    first_run = _seed(mongo, [_run_entry("e1")], [_set_entry("e1")])
    second_run = _seed(mongo, [_run_entry("e1")], [])

    await run_judge_pass(first_run, MAIN_ID)
    await run_judge_pass(second_run, MAIN_ID)

    golden_calls = [
        call
        for call in judge_calls
        if call["kind"] == "judge_summary" and call["summary"] == GOLDEN_TEXT
    ]
    assert len(golden_calls) == 1
    stored = _stored_set_entry(mongo, "e1")["golden_judges"]
    assert [judge["judge_model"] for judge in stored] == [MAIN_ID]


async def test_a_second_judge_adds_its_golden_judgement_next_to_the_first(
    mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    first_run = _seed(mongo, [_run_entry("e1")], [_set_entry("e1")])
    second_run = _seed(mongo, [_run_entry("e1")], [])

    await run_judge_pass(first_run, MAIN_ID)
    await run_judge_pass(second_run, SECOND_ID)

    stored = _stored_set_entry(mongo, "e1")["golden_judges"]
    assert sorted(judge["judge_model"] for judge in stored) == sorted([MAIN_ID, SECOND_ID])


async def test_an_entry_without_a_golden_summary_gets_no_golden_judgement_and_no_pairwise(
    mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    run_id = _seed(mongo, [_run_entry("e1", golden=None)], [_set_entry("e1", golden=None)])

    await run_judge_pass(run_id, MAIN_ID)

    assert [judge["judge_model"] for judge in _stored_judges(mongo, run_id, "e1")] == [MAIN_ID]
    assert not _stored_set_entry(mongo, "e1").get("golden_judges")
    assert [call for call in judge_calls if call["kind"] == "pairwise"] == []
    assert _stored_run_entry(mongo, run_id, "e1")["cross_metrics"] is None


async def test_pairwise_result_is_stored_on_the_entry_for_the_chosen_judge(
    mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    run_id = _seed(mongo, [_run_entry("e1")], [_set_entry("e1")])

    await run_judge_pass(run_id, SECOND_ID)

    pairwise = _stored_run_entry(mongo, run_id, "e1")["cross_metrics"]["pairwise"]
    assert [(item["judge_model"], item["score"]) for item in pairwise] == [(SECOND_ID, 0.9)]


async def test_an_unusable_judge_answer_is_stored_with_error_and_the_pass_continues(
    monkeypatch: pytest.MonkeyPatch, mongo: SimpleNamespace, judge_calls: list[dict]
) -> None:
    async def judge_summary_failing_on_first_entry(
        source_text: str, summary: str, keyfacts: list[str], language: str, judge: JudgeModelRef
    ) -> SummaryJudgement:
        if summary == "AI summary of e1.":
            return SummaryJudgement.model_validate(_unusable_judgement(judge.model_id()))
        return _judgement(judge.model_id())

    _patch_everywhere(monkeypatch, "judge_summary", judge_summary_failing_on_first_entry)
    run_id = _seed(
        mongo, [_run_entry("e1"), _run_entry("e2")], [_set_entry("e1"), _set_entry("e2")]
    )

    await run_judge_pass(run_id, MAIN_ID)

    [broken] = _stored_judges(mongo, run_id, "e1")
    assert broken["error"] == "judge answered with garbage"
    assert broken["fact_level"] is None
    [fine] = _stored_judges(mongo, run_id, "e2")
    assert fine["error"] is None
    assert mongo.runs.documents[0]["aggregate_metrics"]["judges"]["status"] == "completed"


# ---------------------------------------------------------------- judge_summary


@pytest.fixture
def judge_stages(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """The three LLM stages behind judge_summary; each one records the judge it was given."""
    seen_judges: dict[str, Any] = {}
    behaviour: dict[str, Any] = {"raise": {}}

    def stage(name: str, build_result: Callable[[str], Any]) -> Callable[..., Any]:
        async def fake(*args: Any, **kwargs: Any) -> Any:
            judge = next(v for v in [*args, *kwargs.values()] if isinstance(v, JudgeModelRef))
            seen_judges[name] = judge
            if name in behaviour["raise"]:
                raise behaviour["raise"][name]
            return build_result(judge.model_id())

        return fake

    _patch_everywhere(monkeypatch, "judge_fact_level", stage("fact_level", _fact_level))
    _patch_everywhere(monkeypatch, "judge_coherence", stage("coherence", _coherence))
    _patch_everywhere(
        monkeypatch, "evaluate_summarization_metric", stage("summarization", _summarization_result)
    )
    behaviour["seen"] = seen_judges
    return behaviour


async def test_judge_summary_runs_all_three_judges_with_the_chosen_model(
    judge_stages: dict[str, Any],
) -> None:
    result = await judge_summary(SOURCE_TEXT, GOLDEN_TEXT, KEYFACTS, "en", SECOND_JUDGE)

    assert result.error is None
    assert result.judge_model == SECOND_ID
    assert result.fact_level is not None
    assert result.coherence is not None
    assert result.summarization_metric is not None
    assert judge_stages["seen"] == {
        "fact_level": SECOND_JUDGE,
        "coherence": SECOND_JUDGE,
        "summarization": SECOND_JUDGE,
    }


@pytest.mark.parametrize("stage", ["fact_level", "coherence", "summarization"])
@pytest.mark.parametrize("failure", [LlmOutputError("bad json", "raw"), ValueError("bad value")])
async def test_judge_summary_returns_an_error_judgement_when_any_stage_is_unusable(
    judge_stages: dict[str, Any], stage: str, failure: Exception
) -> None:
    judge_stages["raise"][stage] = failure

    result = await judge_summary(SOURCE_TEXT, GOLDEN_TEXT, KEYFACTS, "en", MAIN_JUDGE)

    assert isinstance(result.error, str)
    assert result.error
    assert result.judge_model == MAIN_ID
    assert result.fact_level is None
    assert result.coherence is None
    assert result.summarization_metric is None


# ---------------------------------------------------------------- aggregates and calibration


def _entry_response(
    entry_id: str,
    ai_judges: list[SummaryJudgement],
    golden_judges: list[SummaryJudgement],
    pairwise_scores: list[tuple[str, float]],
) -> EvaluationRunEntryResponse:
    return EvaluationRunEntryResponse.model_validate(
        {
            "entry_id": entry_id,
            "title": entry_id,
            "url": "https://example.com",
            "golden_summary": GOLDEN_TEXT,
            "golden_judges": [_dump(judge) for judge in golden_judges],
            "status": "completed",
            "ai_metrics": {
                "summary": SUMMARY_STATISTICS,
                "judges": [_dump(judge) for judge in ai_judges],
            },
            "cross_metrics": {
                **CROSS_STATISTICS,
                "pairwise": [_pairwise_item(judge, score) for judge, score in pairwise_scores],
            },
        }
    )


def test_aggregate_averages_ai_and_golden_scores_of_the_requested_judge_only() -> None:
    entries = [
        _entry_response(
            "e1",
            [
                _judgement(MAIN_ID, faithfulness=1.0, completeness=0.5, conciseness=1.0),
                _judgement(SECOND_ID, faithfulness=0.0),
            ],
            [_judgement(MAIN_ID, faithfulness=0.5, completeness=1.0, conciseness=0.5)],
            [],
        ),
        _entry_response(
            "e2",
            [
                _judgement(
                    MAIN_ID,
                    faithfulness=0.5,
                    completeness=0.5,
                    conciseness=0.5,
                    has_repetition=True,
                )
            ],
            [_judgement(MAIN_ID, faithfulness=0.5, completeness=1.0, conciseness=0.5)],
            [],
        ),
    ]

    aggregate = aggregate_run_judgements(entries, MAIN_ID)

    assert aggregate.judge_model == MAIN_ID
    assert aggregate.ai.judged == 2
    assert aggregate.ai.faithfulness_mean == pytest.approx(0.75)
    assert aggregate.ai.completeness_mean == pytest.approx(0.5)
    assert aggregate.ai.conciseness_mean == pytest.approx(0.75)
    assert aggregate.ai.repetition_share == pytest.approx(0.5)
    assert aggregate.ai.coherent_share == pytest.approx(1.0)
    assert aggregate.ai.summarization_metric_mean == pytest.approx(0.8)
    assert aggregate.golden.judged == 2
    assert aggregate.golden.faithfulness_mean == pytest.approx(0.5)
    assert aggregate.golden.completeness_mean == pytest.approx(1.0)


def test_aggregate_leaves_unusable_judgements_out_of_the_means_and_counts_them() -> None:
    unusable = SummaryJudgement.model_validate(_unusable_judgement(MAIN_ID))
    entries = [
        _entry_response("e1", [_judgement(MAIN_ID, faithfulness=0.5)], [], []),
        _entry_response("e2", [unusable], [], []),
    ]

    aggregate = aggregate_run_judgements(entries, MAIN_ID)

    assert aggregate.ai.judged == 2  # judged counts every stored judgement, unusable ones included
    assert aggregate.ai.unusable == 1
    assert aggregate.ai.faithfulness_mean == pytest.approx(0.5)


def test_aggregate_without_any_judgement_has_no_means() -> None:
    aggregate = aggregate_run_judgements([_entry_response("e1", [], [], [])], MAIN_ID)

    assert aggregate.ai.judged == 0
    assert aggregate.ai.faithfulness_mean is None
    assert aggregate.ai.repetition_share is None
    assert aggregate.ai.coherent_share is None
    assert aggregate.golden.judged == 0
    assert aggregate.golden.summarization_metric_mean is None


def test_aggregate_counts_pairwise_wins_ties_and_losses_of_the_requested_judge() -> None:
    entries = [
        _entry_response("e1", [], [], [(MAIN_ID, 0.9), (SECOND_ID, 0.1)]),
        _entry_response("e2", [], [], [(MAIN_ID, 0.2)]),
        _entry_response("e3", [], [], [(MAIN_ID, 0.5)]),
        _entry_response("e4", [], [], [(MAIN_ID, 1.0)]),
    ]

    aggregate = aggregate_run_judgements(entries, MAIN_ID)

    assert aggregate.pairwise_judged == 4
    assert aggregate.pairwise_ai_wins == 2
    assert aggregate.pairwise_golden_wins == 1
    assert aggregate.pairwise_ties == 1


def test_calibration_is_known_for_both_judges_keyed_by_model_id() -> None:
    assert MAIN_ID == "openrouter:tencent/hy4-flash"
    assert KEYFACT_MODEL == SECOND_JUDGE
    assert set(JUDGE_CALIBRATION) >= {MAIN_ID, SECOND_ID}
    for calibration in JUDGE_CALIBRATION.values():
        for rates in (
            calibration.faithfulness,
            calibration.keyfact_present,
            calibration.sentence_carries_keyfact,
            calibration.coherence,
        ):
            assert 0.0 <= rates.tpr <= 1.0
            assert 0.0 <= rates.tnr <= 1.0


# ---------------------------------------------------------------- HTTP


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, mongo: SimpleNamespace) -> TestClient:
    monkeypatch.setattr(settings, "auth_enabled", False)
    app = FastAPI()
    app.include_router(evaluation_runs_router.router)
    return TestClient(app)


@pytest.fixture
def scheduled_passes(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str, bool]]:
    scheduled: list[tuple[str, str, bool]] = []

    async def fake_run_judge_pass(run_id: str, judge_model: str, force: bool = False) -> None:
        scheduled.append((run_id, judge_model, force))

    _patch_everywhere(monkeypatch, "run_judge_pass", fake_run_judge_pass)
    return scheduled


def _seed_finished_run(mongo: SimpleNamespace, **kwargs: Any) -> str:
    run = _run_document([_run_entry("e1")], **kwargs)
    mongo.runs.documents.append(run)
    return str(run["_id"])


def test_posting_without_a_body_queues_the_main_judge(
    client: TestClient, mongo: SimpleNamespace, scheduled_passes: list[tuple[str, str, bool]]
) -> None:
    run_id = _seed_finished_run(mongo)

    response = client.post(f"{PREFIX}/runs/{run_id}/judges")

    assert response.status_code == 200
    assert response.json() == {"status": "queued", "run_id": run_id, "judge_model": MAIN_ID}
    assert scheduled_passes == [(run_id, MAIN_ID, False)]


def test_posting_a_chosen_judge_and_force_schedules_the_pass_with_them(
    client: TestClient, mongo: SimpleNamespace, scheduled_passes: list[tuple[str, str, bool]]
) -> None:
    run_id = _seed_finished_run(mongo)

    response = client.post(
        f"{PREFIX}/runs/{run_id}/judges", json={"judge_model": SECOND_ID, "force": True}
    )

    assert response.status_code == 200
    assert response.json()["judge_model"] == SECOND_ID
    assert scheduled_passes == [(run_id, SECOND_ID, True)]
    assert mongo.runs.documents[0]["aggregate_metrics"]["judges"]["judge_model"] == SECOND_ID


@pytest.mark.parametrize("run_status", ["pending", "running"])
def test_judges_are_refused_while_the_run_is_unfinished(
    client: TestClient,
    mongo: SimpleNamespace,
    scheduled_passes: list[tuple[str, str, bool]],
    run_status: str,
) -> None:
    run_id = _seed_finished_run(mongo, status=run_status)

    response = client.post(f"{PREFIX}/runs/{run_id}/judges")

    assert response.status_code == 409
    assert scheduled_passes == []


def test_judges_are_refused_while_another_pass_holds_the_run(
    client: TestClient, mongo: SimpleNamespace, scheduled_passes: list[tuple[str, str, bool]]
) -> None:
    run_id = _seed_finished_run(
        mongo,
        judges_status={
            "status": "running",
            "heartbeat_at": datetime.now(UTC),
            "judge_model": MAIN_ID,
            "resume_attempts": 0,
        },
    )

    response = client.post(f"{PREFIX}/runs/{run_id}/judges", json={"judge_model": SECOND_ID})

    assert response.status_code == 409
    assert scheduled_passes == []


@pytest.mark.parametrize(
    "judge_model",
    [
        pytest.param("openrouter:made-up/model", id="unsupported_name"),
        pytest.param("nosuchprovider:tencent/hy4-flash", id="unsupported_provider"),
        pytest.param("tencent/hy4-flash", id="missing_provider"),
        pytest.param("", id="empty"),
    ],
)
def test_an_unsupported_or_malformed_judge_model_is_rejected(
    client: TestClient,
    mongo: SimpleNamespace,
    scheduled_passes: list[tuple[str, str, bool]],
    judge_model: str,
) -> None:
    run_id = _seed_finished_run(mongo)

    response = client.post(f"{PREFIX}/runs/{run_id}/judges", json={"judge_model": judge_model})

    assert response.status_code == 422
    assert scheduled_passes == []


def test_judges_for_a_missing_run_is_404(
    client: TestClient, scheduled_passes: list[tuple[str, str, bool]]
) -> None:
    response = client.post(f"{PREFIX}/runs/{ObjectId()}/judges")

    assert response.status_code == 404
    assert scheduled_passes == []


def test_the_old_deepeval_route_is_gone(
    client: TestClient, mongo: SimpleNamespace, scheduled_passes: list[tuple[str, str, bool]]
) -> None:
    run_id = _seed_finished_run(mongo)

    response = client.post(f"{PREFIX}/runs/{run_id}/deepeval")

    assert response.status_code in {404, 405}


def test_getting_a_run_returns_an_aggregate_per_judge_present_and_known_calibration(
    client: TestClient, mongo: SimpleNamespace
) -> None:
    unknown_judge = "openrouter:other/unknown-model"
    entry = _run_entry(
        "e1",
        judges=[
            _dump(_judgement(MAIN_ID, faithfulness=0.5)),
            _dump(_judgement(unknown_judge, faithfulness=1.0)),
        ],
    )
    run = _run_document([entry])
    mongo.runs.documents.append(run)
    mongo.sets.documents.append(
        _set_document(
            [_set_entry("e1", golden_judges=[_dump(_judgement(MAIN_ID, faithfulness=0.25))])]
        )
    )

    response = client.get(f"{PREFIX}/runs/{run['_id']}")

    assert response.status_code == 200
    body = response.json()
    aggregates = {item["judge_model"]: item for item in body["judge_aggregates"]}
    assert set(aggregates) == {MAIN_ID, unknown_judge}
    assert aggregates[MAIN_ID]["ai"]["faithfulness_mean"] == pytest.approx(0.5)
    assert aggregates[MAIN_ID]["golden"]["faithfulness_mean"] == pytest.approx(0.25)
    assert set(body["judge_calibration"]) == set(JUDGE_CALIBRATION)
    assert set(body["judge_calibration"][MAIN_ID]) == {
        "faithfulness",
        "keyfact_present",
        "sentence_carries_keyfact",
        "coherence",
    }
