from __future__ import annotations

import asyncio
from dataclasses import asdict

from ...core.executors import run_blocking
from ...schemas.judges import DeepevalItem, SummaryJudgement
from ..llm import LlmOutputError
from .coherence import judge_coherence
from .cross import rouge_meteor_scores
from .deepeval import evaluate_summarization_metric
from .fact_level_judges import JudgeModelRef, judge_fact_level, split_sentences
from .statistical import summary_metrics


async def compute_statistical_metrics(
    summary_text: str,
    source_text: str,
) -> dict:
    def compute() -> dict:
        return {"summary": summary_metrics(summary_text, source_text)}

    return await run_blocking(compute)


async def compute_cross_metrics(
    reference_text: str,
    summary_text: str,
    language: str,
) -> dict[str, float | None]:
    return await run_blocking(rouge_meteor_scores, reference_text, summary_text, language)


async def judge_summary(
    source_text: str, summary: str, keyfacts: list[str], language: str, judge: JudgeModelRef
) -> SummaryJudgement:
    """Fact-level judges, coherence and SummarizationMetric on one summary with one judge model."""
    try:
        sentences = split_sentences(summary, language)
        fact_level, coherence, summarization_metric = await asyncio.gather(
            judge_fact_level(source_text, summary, keyfacts, language, judge),
            judge_coherence(summary, judge),
            evaluate_summarization_metric(judge, source_text, summary),
        )
    except (
        KeyError,
        LlmOutputError,
        ValueError,
    ) as error:  # deepeval: ValueError on a malformed answer, KeyError on a missing key
        return SummaryJudgement(judge_model=judge.model_id(), error=str(error))

    return SummaryJudgement(
        judge_model=judge.model_id(),
        sentences=sentences,
        fact_level=fact_level,
        coherence=coherence,
        summarization_metric=DeepevalItem.model_validate(asdict(summarization_metric)),
    )
