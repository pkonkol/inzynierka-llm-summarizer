from __future__ import annotations

from typing import Any

from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from nltk.translate.meteor_score import meteor_score
from rouge_score import rouge_scorer

from ...core.config import Settings
from .deepeval import GEvalSpec, evaluate_geval

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


_PAIRWISE_SPECS = [
    GEvalSpec(
        name="pairwise_with_input",
        criteria=(
            "Evaluate whether Summary A (actual_output) is better than Summary B (expected_output) "
            "for the given source document, using faithfulness to source, coverage of key information, "
            "coherence, and readability."
        ),
        params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
        ],
        evaluation_steps=[
            "Read the source document and identify the main points.",
            "Compare Summary A and Summary B against the source.",
            "Decide whether Summary A is better overall than Summary B.",
            "Assign higher score when Summary A is better, lower score when Summary B is better.",
        ],
    ),
    GEvalSpec(
        name="pairwise_without_input",
        criteria=(
            "Evaluate whether Summary A (actual_output) is better than Summary B (expected_output) "
            "using only summary quality: coherence, readability, fluency, factual density, and usefulness."
        ),
        params=[LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.EXPECTED_OUTPUT],
        evaluation_steps=[
            "Read Summary A.",
            "Read Summary B.",
            "Compare quality and informativeness.",
            "Assign higher score when Summary A is better, lower score when Summary B is better.",
        ],
    ),
]


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

    The first spec judges against the source document, the second on summary quality alone,
    so they differ only in whether the test case carries the source text.
    """
    work = [
        (
            spec,
            LLMTestCase(
                input=source_text if LLMTestCaseParams.INPUT in spec.params else "",
                actual_output=summary_actual,
                expected_output=summary_expected,
            ),
        )
        for spec in _PAIRWISE_SPECS
    ]
    results = await evaluate_geval(settings, work)

    return [
        {"name": result.name, "score": round(result.score, 4), "reason": result.reason}
        for result in results
    ]
