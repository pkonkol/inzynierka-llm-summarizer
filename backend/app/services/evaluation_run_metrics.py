from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from statistics import fmean
from typing import Any

import structlog
from bson import ObjectId

from ..core.background_work import track_background_work
from ..core.mongo import (
    find_evaluation_set_entry_or_raise,
    get_evaluation_runs_collection,
    get_evaluation_sets_collection,
)
from ..schemas.evaluation_run_api import (
    EvaluationRunEntryResponse,
    JudgeScoreSummary,
    RunJudgeAggregate,
)
from ..schemas.judges import SourceKeyfacts, SummaryJudgement
from .llm import LlmOutputError
from .metrics import judge_summary
from .metrics.cross import evaluate_pairwise_cross_deepeval
from .metrics.fact_level_judges import KEYFACT_MODEL, JudgeModelRef, extract_keyfacts

log = structlog.get_logger(__name__)


async def _store_pass_status(run_id: str, fields: dict[str, Any]) -> None:
    prefixed = {f"aggregate_metrics.judges.{key}": value for key, value in fields.items()}
    await get_evaluation_runs_collection().update_one({"_id": ObjectId(run_id)}, {"$set": prefixed})


async def reset_run_judgements(run_id: str, judge_model: str) -> None:
    """Drops one judge's results from every completed entry, so the next pass judges them again."""
    log.debug("resetting run judgements", run_id=run_id, judge_model=judge_model)
    result = await get_evaluation_runs_collection().update_one(
        {"_id": ObjectId(run_id)},
        {
            "$pull": {
                "entries.$[completed].ai_metrics.judges": {"judge_model": judge_model},
                "entries.$[paired].cross_metrics.pairwise": {"judge_model": judge_model},
            }
        },
        array_filters=[
            {"completed.status": "completed"},
            {"paired.status": "completed", "paired.cross_metrics": {"$ne": None}},
        ],
    )
    log.debug("run judgements reset", run_id=run_id, modified=result.modified_count)


@track_background_work("judge_pass")
async def run_judge_pass(run_id: str, judge_model: str, force: bool = False) -> None:
    """Judges every completed entry this judge has not judged yet, one entry at a time.

    Each entry is written back, and the pass heartbeat refreshed, the moment it is judged, so a
    restart mid-pass resumes from whatever is left instead of paying the judge twice.
    With force, this judge's results are dropped first; other judges' results stay.
    """
    structlog.contextvars.bind_contextvars(run_id=run_id, judge_model=judge_model)
    try:
        if force:
            await _reset_or_fail_pass(run_id, judge_model)
        await _judge_run_entries(run_id, JudgeModelRef.parse(judge_model))
    finally:
        structlog.contextvars.unbind_contextvars("run_id", "judge_model")


async def _reset_or_fail_pass(run_id: str, judge_model: str) -> None:
    """A failed reset ends the pass as failed, so the run can be claimed again."""
    try:
        await reset_run_judgements(run_id, judge_model)
    except Exception as exc:
        log.exception("resetting run judgements failed")
        await _store_pass_status(
            run_id, {"status": "failed", "error": str(exc), "finished_at": datetime.now(UTC)}
        )
        raise


async def _judge_run_entries(run_id: str, judge: JudgeModelRef) -> None:
    run_doc = await get_evaluation_runs_collection().find_one(
        {"_id": ObjectId(run_id)},
        {
            "evaluation_set_id": 1,
            "entries.entry_id": 1,
            "entries.status": 1,
            "entries.ai_summary": 1,
            "entries.ai_metrics.judges": 1,
            "entries.cross_metrics": 1,
        },
    )
    if run_doc is None:
        return

    set_id = run_doc["evaluation_set_id"]
    set_doc = await get_evaluation_sets_collection().find_one(
        {"_id": ObjectId(set_id)}, {"language": 1}
    )
    if set_doc is None:
        await _store_pass_status(
            run_id,
            {
                "status": "failed",
                "error": "Evaluation set not found",
                "finished_at": datetime.now(UTC),
            },
        )
        return

    started_at = datetime.now(UTC)
    await _store_pass_status(
        run_id, {"status": "running", "started_at": started_at, "heartbeat_at": started_at}
    )

    updated_entries = 0
    skipped_entries = 0
    already_scored_entries = 0
    try:
        for entry in run_doc["entries"]:
            if entry["status"] != "completed":
                skipped_entries += 1
                continue
            set_entry = await find_evaluation_set_entry_or_raise(set_id, entry["entry_id"])
            missing = _missing_judgements(entry, set_entry, judge)
            if not missing.anything:
                already_scored_entries += 1
                continue
            await _judge_entry(
                run_id, set_id, set_doc["language"], entry, set_entry, missing, judge
            )
            updated_entries += 1
    except Exception as exc:
        log.exception("judge pass failed")
        await _store_pass_status(
            run_id, {"status": "failed", "error": str(exc), "finished_at": datetime.now(UTC)}
        )
        raise

    await _store_pass_status(
        run_id,
        {
            "status": "completed",
            "updated_entries": updated_entries,
            "skipped_entries": skipped_entries,
            "already_scored_entries": already_scored_entries,
            "finished_at": datetime.now(UTC),
        },
    )


class _Need(Enum):
    NONE = "none"
    NEW = "new"
    RETRY = "retry"  # this judge's earlier judgement has an error and gets replaced


@dataclass(frozen=True)
class _MissingJudgements:
    golden: _Need
    ai: _Need
    pair: bool

    @property
    def summaries(self) -> bool:
        return self.golden is not _Need.NONE or self.ai is not _Need.NONE

    @property
    def anything(self) -> bool:
        return self.summaries or self.pair


def _missing_judgements(
    entry: dict[str, Any], set_entry: dict[str, Any], judge: JudgeModelRef
) -> _MissingJudgements:
    """What this judge still has to judge on the entry; a judgement with an error is judged again."""
    cross_metrics = entry.get("cross_metrics")
    golden_need = (
        _Need.NONE
        if set_entry["golden_summary"] is None
        else _need(set_entry.get("golden_judges"), judge)
    )
    return _MissingJudgements(
        golden=golden_need,
        ai=_need(entry.get("ai_metrics", {}).get("judges"), judge),
        pair=cross_metrics is not None
        and not _has_judgement(  # an unusable pair is never stored, so a stored one is usable
            cross_metrics.get("pairwise"), judge
        ),
    )


def _need(judgements: list[dict[str, Any]] | None, judge: JudgeModelRef) -> _Need:
    own = [
        judgement for judgement in judgements or [] if judgement["judge_model"] == judge.model_id()
    ]
    if not own:
        return _Need.NEW
    if any(judgement["error"] is None for judgement in own):
        return _Need.NONE
    return _Need.RETRY


def _has_judgement(judgements: list[dict[str, Any]] | None, judge: JudgeModelRef) -> bool:
    return any(judgement["judge_model"] == judge.model_id() for judgement in judgements or [])


async def _judge_entry(
    run_id: str,
    set_id: str,
    language: str,
    entry: dict[str, Any],
    set_entry: dict[str, Any],
    missing: _MissingJudgements,
    judge: JudgeModelRef,
) -> None:
    entry_id = entry["entry_id"]
    log.debug("judging run entry", entry_id=entry_id)
    ai_summary = entry["ai_summary"].strip()

    summaries_call = _judge_golden_and_ai(set_id, set_entry, ai_summary, language, missing, judge)
    pair_call = (
        _pairwise(judge, set_entry["input_text"], ai_summary, set_entry["golden_summary"])
        if missing.pair
        else _nothing()
    )
    (golden_judgement, ai_judgement), pairwise = await asyncio.gather(summaries_call, pair_call)

    if golden_judgement is not None:
        await _store_golden_judgement(
            set_id, entry_id, golden_judgement, replaces_error=missing.golden is _Need.RETRY
        )
    await _store_entry_results(
        run_id, entry_id, ai_judgement, pairwise, ai_replaces_error=missing.ai is _Need.RETRY
    )


async def _nothing() -> None:
    return None


async def _judge_golden_and_ai(
    set_id: str,
    set_entry: dict[str, Any],
    ai_summary: str,
    language: str,
    missing: _MissingJudgements,
    judge: JudgeModelRef,
) -> tuple[SummaryJudgement | None, SummaryJudgement | None]:
    """Both need the set entry's key facts; an unusable extraction gives both an error judgement."""
    if not missing.summaries:
        return None, None

    log.debug("judging golden and ai summaries", entry_id=set_entry["entry_id"])
    try:
        keyfacts = await _set_entry_keyfacts(set_id, set_entry, language)
    except LlmOutputError as error:
        log.exception("keyfact answer unusable", entry_id=set_entry["entry_id"])
        failed = SummaryJudgement(
            judge_model=judge.model_id(), error=f"key facts could not be extracted: {error}"
        )
        return (
            failed if missing.golden is not _Need.NONE else None,
            failed if missing.ai is not _Need.NONE else None,
        )

    source_text = set_entry["input_text"]
    golden_call = (
        judge_summary(source_text, set_entry["golden_summary"], keyfacts, language, judge)
        if missing.golden is not _Need.NONE
        else _nothing()
    )
    ai_call = (
        judge_summary(source_text, ai_summary, keyfacts, language, judge)
        if missing.ai is not _Need.NONE
        else _nothing()
    )
    golden_judgement, ai_judgement = await asyncio.gather(golden_call, ai_call)
    return golden_judgement, ai_judgement


async def _set_entry_keyfacts(set_id: str, set_entry: dict[str, Any], language: str) -> list[str]:
    """Extracted once per set entry and shared by every run and judge of the set."""
    if set_entry.get("keyfacts") is not None:
        return set_entry["keyfacts"]["keyfacts"]

    keyfacts = await extract_keyfacts(set_entry["input_text"], language, KEYFACT_MODEL)
    stored = SourceKeyfacts(keyfacts=keyfacts, model=KEYFACT_MODEL.model_id())
    await get_evaluation_sets_collection().update_one(
        {"_id": ObjectId(set_id), "entries.entry_id": set_entry["entry_id"]},
        {"$set": {"entries.$.keyfacts": stored.model_dump()}},
    )
    return keyfacts


async def _store_golden_judgement(
    set_id: str, entry_id: str, golden_judgement: SummaryJudgement, replaces_error: bool
) -> None:
    log.debug("storing golden judgement", entry_id=entry_id, replaces_error=replaces_error)
    set_entry_query = {"_id": ObjectId(set_id), "entries.entry_id": entry_id}
    sets = get_evaluation_sets_collection()
    if replaces_error:
        await sets.update_one(
            set_entry_query,
            {"$pull": {"entries.$.golden_judges": {"judge_model": golden_judgement.judge_model}}},
        )
    await sets.update_one(
        set_entry_query, {"$push": {"entries.$.golden_judges": golden_judgement.model_dump()}}
    )


async def _pairwise(
    judge: JudgeModelRef, source_text: str, ai_summary: str, golden_summary: str
) -> dict[str, Any] | None:
    """None when the judge answer is unusable; the next pass asks again."""
    try:
        return await evaluate_pairwise_cross_deepeval(
            judge, source_text, ai_summary, golden_summary
        )
    except (
        KeyError,
        ValueError,
        LlmOutputError,
    ) as error:  # deepeval: KeyError on a missing "score"
        log.warning("pairwise answer unusable", error=repr(error))
        return None


async def _store_entry_results(
    run_id: str,
    entry_id: str,
    ai_judgement: SummaryJudgement | None,
    pairwise: dict[str, Any] | None,
    ai_replaces_error: bool,
) -> None:
    log.debug("storing run entry results", entry_id=entry_id, ai_replaces_error=ai_replaces_error)
    run_entry_query = {"_id": ObjectId(run_id), "entries.entry_id": entry_id}
    runs = get_evaluation_runs_collection()
    if ai_judgement is not None and ai_replaces_error:
        await runs.update_one(
            run_entry_query,
            {"$pull": {"entries.$.ai_metrics.judges": {"judge_model": ai_judgement.judge_model}}},
        )

    pushes: dict[str, Any] = {}
    if ai_judgement is not None:
        pushes["entries.$.ai_metrics.judges"] = ai_judgement.model_dump()
    if pairwise is not None:
        pushes["entries.$.cross_metrics.pairwise"] = pairwise

    update: dict[str, Any] = {"$set": {"aggregate_metrics.judges.heartbeat_at": datetime.now(UTC)}}
    if pushes:
        update["$push"] = pushes
    await runs.update_one(run_entry_query, update)


def aggregate_run_judgements_per_judge(
    entries: list[EvaluationRunEntryResponse],
) -> list[RunJudgeAggregate]:
    """One aggregate for every judge that has judged the run's AI summaries."""
    log.debug("aggregating run judgements", entries=len(entries))
    judge_models = sorted(
        {judgement.judge_model for entry in entries for judgement in _ai_judgements(entry)}
    )
    return [aggregate_run_judgements(entries, judge_model) for judge_model in judge_models]


def aggregate_run_judgements(
    entries: list[EvaluationRunEntryResponse], judge_model: str
) -> RunJudgeAggregate:
    """AI vs golden for one judge, counted from the stored per-entry results.

    The counts cover the entries this judge judged in this run. The means on both sides come from
    the same compared entries: a usable AI judgement and, when the entry has a golden summary, a
    usable golden judgement.
    """
    judged_entries = [
        entry for entry in entries if _judgements_of(judge_model, _ai_judgements(entry))
    ]
    compared_entries = [entry for entry in entries if _is_compared(entry, judge_model)]

    ai_stored = [
        judgement
        for entry in judged_entries
        for judgement in _judgements_of(judge_model, _ai_judgements(entry))
    ]
    golden_stored = [
        judgement
        for entry in judged_entries
        for judgement in _judgements_of(judge_model, entry.golden_judges)
    ]
    ai_compared = [
        judgement
        for entry in compared_entries
        for judgement in _usable_judgements(judge_model, _ai_judgements(entry))
    ]
    golden_compared = [
        judgement
        for entry in compared_entries
        for judgement in _usable_judgements(judge_model, entry.golden_judges)
    ]
    pair_scores = [
        pair.score
        for entry in entries
        if entry.cross_metrics is not None
        for pair in entry.cross_metrics.pairwise
        if pair.judge_model == judge_model
    ]
    return RunJudgeAggregate(
        judge_model=judge_model,
        ai=_score_summary(counted=ai_stored, averaged=ai_compared),
        golden=_score_summary(counted=golden_stored, averaged=golden_compared),
        pairwise_judged=len(pair_scores),
        pairwise_ai_wins=sum(score > 0.5 for score in pair_scores),
        pairwise_golden_wins=sum(score < 0.5 for score in pair_scores),
        pairwise_ties=sum(score == 0.5 for score in pair_scores),
    )


def _ai_judgements(entry: EvaluationRunEntryResponse) -> list[SummaryJudgement]:
    return entry.ai_metrics.judges if entry.ai_metrics is not None else []


def _judgements_of(judge_model: str, judgements: list[SummaryJudgement]) -> list[SummaryJudgement]:
    return [judgement for judgement in judgements if judgement.judge_model == judge_model]


def _usable_judgements(
    judge_model: str, judgements: list[SummaryJudgement]
) -> list[SummaryJudgement]:
    return [
        judgement
        for judgement in _judgements_of(judge_model, judgements)
        if judgement.error is None
    ]


def _is_compared(entry: EvaluationRunEntryResponse, judge_model: str) -> bool:
    has_usable_ai = bool(_usable_judgements(judge_model, _ai_judgements(entry)))
    has_usable_golden = entry.golden_summary is None or bool(
        _usable_judgements(judge_model, entry.golden_judges)
    )
    return has_usable_ai and has_usable_golden


def _mean(values: list[float]) -> float | None:
    return round(fmean(values), 4) if values else None


def _score_summary(
    *, counted: list[SummaryJudgement], averaged: list[SummaryJudgement]
) -> JudgeScoreSummary:
    fact_scores = [j.fact_level.scores for j in averaged if j.fact_level is not None]
    coherence = [j.coherence.judgement.coherent for j in averaged if j.coherence is not None]
    summarization = [
        j.summarization_metric.score for j in averaged if j.summarization_metric is not None
    ]
    return JudgeScoreSummary(
        judged=len(counted),
        unusable=sum(judgement.error is not None for judgement in counted),
        compared=len(averaged),
        faithfulness_mean=_mean([scores.faithfulness for scores in fact_scores]),
        completeness_mean=_mean([scores.completeness for scores in fact_scores]),
        conciseness_mean=_mean([scores.conciseness for scores in fact_scores]),
        repetition_share=_mean([float(scores.has_repetition) for scores in fact_scores]),
        coherent_share=_mean([float(coherent) for coherent in coherence]),
        summarization_metric_mean=_mean(summarization),
    )
