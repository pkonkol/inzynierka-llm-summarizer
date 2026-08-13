from __future__ import annotations

import asyncio
from typing import Any

from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from nltk.translate.meteor_score import meteor_score
from rouge_score import rouge_scorer

from ...core.config import Settings
from .deepeval import build_deepeval_model, run_metric

_ROUGE_SCORER = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)


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


def _pairwise_metric_with_input(settings: Settings) -> GEval:
    return GEval(
        name="pairwise_with_input",
        model=build_deepeval_model(settings),
        threshold=0.5,
        criteria=(
            "Evaluate whether Summary A (actual_output) is better than Summary B (expected_output) "
            "for the given source document, using faithfulness to source, coverage of key information, "
            "coherence, and readability."
        ),
        evaluation_steps=[
            "Read the source document and identify the main points.",
            "Compare Summary A and Summary B against the source.",
            "Decide whether Summary A is better overall than Summary B.",
            "Assign higher score when Summary A is better, lower score when Summary B is better.",
        ],
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
        ],  # pyright: ignore[reportAttributeAccessIssue]
    )


def _pairwise_metric_without_input(settings: Settings) -> GEval:
    return GEval(
        name="pairwise_without_input",
        model=build_deepeval_model(settings),
        threshold=0.5,
        criteria=(
            "Evaluate whether Summary A (actual_output) is better than Summary B (expected_output) "
            "using only summary quality: coherence, readability, fluency, factual density, and usefulness."
        ),
        evaluation_steps=[
            "Read Summary A.",
            "Read Summary B.",
            "Compare quality and informativeness.",
            "Assign higher score when Summary A is better, lower score when Summary B is better.",
        ],
        evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.EXPECTED_OUTPUT],  # pyright: ignore[reportAttributeAccessIssue]
    )


async def evaluate_pairwise_cross_deepeval(
    settings: Settings,
    source_text: str,
    summary_actual: str,
    summary_expected: str,
) -> list[dict[str, Any]]:
    """Generic actual-vs-expected pairwise GEval — deliberately unaware of golden/AI.

    The GEval prompt only ever sees "Summary A (actual_output)" / "Summary B (expected_output)"
    to avoid biasing the judge toward either side. Callers decide which summary goes into
    actual_output vs expected_output, and are responsible for mapping the resulting
    "actual"/"expected" winner back to their own domain labels (e.g. golden/AI).
    """
    with_input_case = LLMTestCase(
        input=source_text,
        actual_output=summary_actual,
        expected_output=summary_expected,
    )
    without_input_case = LLMTestCase(
        input="",
        actual_output=summary_actual,
        expected_output=summary_expected,
    )
    with_input_metric = _pairwise_metric_with_input(settings)
    without_input_metric = _pairwise_metric_without_input(settings)

    with_input_result, without_input_result = await asyncio.gather(
        asyncio.to_thread(run_metric, with_input_metric, with_input_case),
        asyncio.to_thread(run_metric, without_input_metric, without_input_case),
    )
    with_input_score = round(with_input_result.score, 4)
    without_input_score = round(without_input_result.score, 4)

    return [
        {
            "name": "pairwise_with_input",
            "score": with_input_score,
            "reason": with_input_result.reason,
        },
        {
            "name": "pairwise_without_input",
            "score": without_input_score,
            "reason": without_input_result.reason,
        },
    ]
