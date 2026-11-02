from __future__ import annotations

import re
from typing import Any

from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from nltk.translate.meteor_score import meteor_score
from rouge_score import rouge_scorer

from ...core.config import Settings
from .deepeval import DeepEvalMetricResult, GEvalSpec, evaluate_geval

_ROUGE_TYPES = ["rouge1", "rouge2", "rougeL"]
_UNICODE_WORD = re.compile(r"\w+")


class _UnicodeWordTokenizer:
    """Lowercased Unicode word tokens for languages the default rouge-score tokenizer mangles."""

    def tokenize(self, text: str) -> list[str]:
        return _UNICODE_WORD.findall(text.lower())


_ENGLISH_ROUGE_SCORER = rouge_scorer.RougeScorer(_ROUGE_TYPES, use_stemmer=True)
# The default tokenizer keeps only [a-z0-9], so "Łódź" becomes ["d"]; Porter stemming is English-only.
_UNICODE_ROUGE_SCORER = rouge_scorer.RougeScorer(_ROUGE_TYPES, tokenizer=_UnicodeWordTokenizer())


def combine_pairwise_orders(
    ai_first: DeepEvalMetricResult, golden_first: DeepEvalMetricResult
) -> dict[str, Any]:
    """Averages both presentation orders into one AI-vs-golden score and flags whether they agree."""
    raise NotImplementedError


def rouge_meteor_scores(
    reference_text: str, summary_text: str, language: str
) -> dict[str, float | None]:
    """English keeps the stemmed scorer and METEOR; any other language gets Unicode tokens and meteor=None."""
    reference = reference_text.strip()
    summary = summary_text.strip()
    is_english = language == "en"

    scorer = _ENGLISH_ROUGE_SCORER if is_english else _UNICODE_ROUGE_SCORER
    rouge = scorer.score(reference, summary)
    # nltk's METEOR matches through an English stemmer and WordNet.
    meteor = (
        round(meteor_score([reference.lower().split()], summary.lower().split()), 4)
        if is_english
        else None
    )

    return {
        "rouge1": round(rouge["rouge1"].fmeasure, 4),
        "rouge2": round(rouge["rouge2"].fmeasure, 4),
        "rougeL": round(rouge["rougeL"].fmeasure, 4),
        "meteor": meteor,
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
