from __future__ import annotations

import asyncio
from typing import Any

from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from nltk.translate.meteor_score import meteor_score
from rouge_score import rouge_scorer

from app.core.config import Settings

from .deepeval import build_deepeval_model, run_metric

_ROUGE_SCORER = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)

PAIRWISE_TIE_MARGIN = 0.05


def compute_cross_metrics(reference_text: str, summary_text: str) -> dict[str, float]:
    reference = reference_text.strip()
    summary = summary_text.strip()

    rouge = _ROUGE_SCORER.score(reference, summary)
    meteor = meteor_score([reference.lower().split()], summary.lower().split())

    return {
        "rouge1": round(rouge["rouge1"].fmeasure, 4),
        "rouge2": round(rouge["rouge2"].fmeasure, 4),
        "rougeL": round(rouge["rougeL"].fmeasure, 4),
        "meteor": round(meteor, 4),
    }


def _pairwise_metric_with_input(settings: Settings, name: str) -> GEval:
    return GEval(
        name=name,
        model=build_deepeval_model(settings),
        threshold=0.5,
        criteria=(
            "Evaluate whether Summary A is better than Summary B for the given source document. "
            "Use faithfulness to source, coverage of key information, coherence, and readability."
        ),
        evaluation_steps=[
            "Read the source document carefully and understand its main points.",
            "Read Summary A and check faithfulness, coverage, coherence, and readability.",
            "Read Summary B and check the same criteria.",
            "Decide if Summary A is better overall than Summary B.",
            "Give higher score when Summary A is clearly better, lower when Summary B is better.",
        ],
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.EXPECTED_OUTPUT],  # pyright: ignore[reportAttributeAccessIssue]
    )


def _pairwise_metric_without_input(settings: Settings, name: str) -> GEval:
    return GEval(
        name=name,
        model=build_deepeval_model(settings),
        threshold=0.5,
        criteria=(
            "Evaluate whether Summary A is better than Summary B based only on summary quality. "
            "Use coherence, factual density, readability, fluency, and overall usefulness."
        ),
        evaluation_steps=[
            "Read Summary A.",
            "Read Summary B.",
            "Compare coherence, readability, fluency, and how informative each summary is.",
            "Decide if Summary A is better overall than Summary B.",
            "Give higher score when Summary A is clearly better, lower when Summary B is better.",
        ],
        evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.EXPECTED_OUTPUT],  # pyright: ignore[reportAttributeAccessIssue]
    )


def _score_to_1_5(score: float) -> int:
    return max(1, min(5, int(round(1 + score * 4))))


def _winner_from_scores(score_a: float, score_b: float) -> str:
    delta = score_a - score_b
    if delta > PAIRWISE_TIE_MARGIN:
        return "A"
    if delta < -PAIRWISE_TIE_MARGIN:
        return "B"
    return "tie"


async def evaluate_pairwise_cross_deepeval(
    settings: Settings,
    source_text: str,
    summary_a: str,
    summary_b: str,
) -> list[dict[str, Any]]:
    case_with_input_ab = LLMTestCase(
        input=source_text,
        actual_output=summary_a,
        expected_output=summary_b,
    )
    case_with_input_ba = LLMTestCase(
        input=source_text,
        actual_output=summary_b,
        expected_output=summary_a,
    )
    case_without_input_ab = LLMTestCase(
        input="",
        actual_output=summary_a,
        expected_output=summary_b,
    )
    case_without_input_ba = LLMTestCase(
        input="",
        actual_output=summary_b,
        expected_output=summary_a,
    )

    metrics = [
        (_pairwise_metric_with_input(settings, "pairwise_with_input_a_vs_b"), case_with_input_ab, "with_input"),
        (_pairwise_metric_with_input(settings, "pairwise_with_input_b_vs_a"), case_with_input_ba, "with_input"),
        (_pairwise_metric_without_input(settings, "pairwise_without_input_a_vs_b"), case_without_input_ab, "without_input"),
        (_pairwise_metric_without_input(settings, "pairwise_without_input_b_vs_a"), case_without_input_ba, "without_input"),
    ]

    results = await asyncio.gather(
        *(asyncio.to_thread(run_metric, metric, test_case) for metric, test_case, _ in metrics)
    )

    with_input_a = results[0]
    with_input_b = results[1]
    without_input_a = results[2]
    without_input_b = results[3]

    with_input_score_a = with_input_a.score or 0.0
    with_input_score_b = with_input_b.score or 0.0
    without_input_score_a = without_input_a.score or 0.0
    without_input_score_b = without_input_b.score or 0.0

    return [
        {
            "name": "pairwise_with_input",
            "winner": _winner_from_scores(with_input_score_a, with_input_score_b),
            "score_A": _score_to_1_5(with_input_score_a),
            "score_B": _score_to_1_5(with_input_score_b),
            "reason": f"A_vs_B: {with_input_a.reason} | B_vs_A: {with_input_b.reason}",
        },
        {
            "name": "pairwise_without_input",
            "winner": _winner_from_scores(without_input_score_a, without_input_score_b),
            "score_A": _score_to_1_5(without_input_score_a),
            "score_B": _score_to_1_5(without_input_score_b),
            "reason": f"A_vs_B: {without_input_a.reason} | B_vs_A: {without_input_b.reason}",
        },
    ]
