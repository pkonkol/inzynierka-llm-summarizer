from __future__ import annotations

import asyncio
from datetime import UTC, datetime
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
            if await _judge_entry(run_id, set_id, set_doc["language"], entry, judge):
                updated_entries += 1
            else:
                already_scored_entries += 1
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


def _judged_by(results: list[dict[str, Any]] | None, judge: JudgeModelRef) -> bool:
    return any(result["judge_model"] == judge.model_id() for result in results or [])


async def _judge_entry(
    run_id: str, set_id: str, language: str, entry: dict[str, Any], judge: JudgeModelRef
) -> bool:
    """False when this judge had already judged everything the entry has; nothing is called then."""
    entry_id = entry["entry_id"]
    set_entry = await find_evaluation_set_entry_or_raise(set_id, entry_id)
    golden_summary = set_entry["golden_summary"]
    cross_metrics = entry.get("cross_metrics")

    needs_golden = golden_summary is not None and not _judged_by(
        set_entry.get("golden_judges"), judge
    )
    needs_ai = not _judged_by(entry.get("ai_metrics", {}).get("judges"), judge)
    needs_pair = cross_metrics is not None and not _judged_by(cross_metrics.get("pairwise"), judge)
    if not (needs_golden or needs_ai or needs_pair):
        return False

    log.debug("judging run entry", entry_id=entry_id)
    source_text = set_entry["input_text"]
    ai_summary = entry["ai_summary"].strip()

    keyfacts = await _set_entry_keyfacts(set_id, set_entry, language)
    golden_judgement, ai_judgement, pairwise = await asyncio.gather(
        judge_summary(source_text, golden_summary, keyfacts, language, judge)
        if needs_golden
        else _nothing(),
        judge_summary(source_text, ai_summary, keyfacts, language, judge)
        if needs_ai
        else _nothing(),
        _pairwise(judge, source_text, ai_summary, golden_summary) if needs_pair else _nothing(),
    )
    if golden_judgement is not None:
        await _push_set_entry_field(
            set_id, entry_id, "golden_judges", golden_judgement.model_dump()
        )
    await _store_entry_results(run_id, entry_id, ai_judgement, pairwise)
    return True


async def _nothing() -> None:
    return None


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


async def _push_set_entry_field(
    set_id: str, entry_id: str, field: str, value: dict[str, Any]
) -> None:
    await get_evaluation_sets_collection().update_one(
        {"_id": ObjectId(set_id), "entries.entry_id": entry_id},
        {"$push": {f"entries.$.{field}": value}},
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
) -> None:
    pushes: dict[str, Any] = {}
    if ai_judgement is not None:
        pushes["entries.$.ai_metrics.judges"] = ai_judgement.model_dump()
    if pairwise is not None:
        pushes["entries.$.cross_metrics.pairwise"] = pairwise

    update: dict[str, Any] = {"$set": {"aggregate_metrics.judges.heartbeat_at": datetime.now(UTC)}}
    if pushes:
        update["$push"] = pushes
    await get_evaluation_runs_collection().update_one(
        {"_id": ObjectId(run_id), "entries.entry_id": entry_id}, update
    )


def aggregate_run_judgements(
    entries: list[EvaluationRunEntryResponse], judge_model: str
) -> RunJudgeAggregate:
    """AI vs golden for one judge, counted from the stored per-entry results."""
    ai_judgements = [
        judgement
        for entry in entries
        if entry.ai_metrics is not None
        for judgement in entry.ai_metrics.judges
        if judgement.judge_model == judge_model
    ]
    golden_judgements = [
        judgement
        for entry in entries
        for judgement in entry.golden_judges
        if judgement.judge_model == judge_model
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
        ai=_score_summary(ai_judgements),
        golden=_score_summary(golden_judgements),
        pairwise_judged=len(pair_scores),
        pairwise_ai_wins=sum(score > 0.5 for score in pair_scores),
        pairwise_golden_wins=sum(score < 0.5 for score in pair_scores),
        pairwise_ties=sum(score == 0.5 for score in pair_scores),
    )


def _mean(values: list[float]) -> float | None:
    return round(fmean(values), 4) if values else None


def _score_summary(judgements: list[SummaryJudgement]) -> JudgeScoreSummary:
    usable = [judgement for judgement in judgements if judgement.error is None]
    fact_scores = [j.fact_level.scores for j in usable if j.fact_level is not None]
    coherence = [j.coherence.judgement.coherent for j in usable if j.coherence is not None]
    summarization = [
        j.summarization_metric.score for j in usable if j.summarization_metric is not None
    ]
    return JudgeScoreSummary(
        judged=len(judgements),
        unusable=len(judgements) - len(usable),
        faithfulness_mean=_mean([scores.faithfulness for scores in fact_scores]),
        completeness_mean=_mean([scores.completeness for scores in fact_scores]),
        conciseness_mean=_mean([scores.conciseness for scores in fact_scores]),
        repetition_share=_mean([float(scores.has_repetition) for scores in fact_scores]),
        coherent_share=_mean([float(coherent) for coherent in coherence]),
        summarization_metric_mean=_mean(summarization),
    )
