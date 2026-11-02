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


def _preferred_summary(ai_score: float) -> str:
    """GEval without logprobs scores in steps of 0.1, so an exact 0.5 tie is a common verdict."""
    if ai_score > 0.5:
        return "ai"
    if ai_score < 0.5:
        return "golden"
    return "tie"


def combine_pairwise_orders(
    ai_first: DeepEvalMetricResult, golden_first: DeepEvalMetricResult
) -> dict[str, Any]:
    """Averages both presentation orders into one AI-vs-golden score and flags whether they agree."""
    ai_score_when_ai_first = ai_first.score
    ai_score_when_golden_first = 1 - golden_first.score
    same_winner = _preferred_summary(ai_score_when_ai_first) == _preferred_summary(
        ai_score_when_golden_first
    )

    return {
        "name": ai_first.name,
        "score": round((ai_score_when_ai_first + ai_score_when_golden_first) / 2, 4),
        "reason": ai_first.reason,
        "score_ai_first": round(ai_first.score, 4),
        "score_golden_first": round(golden_first.score, 4),
        "consistent": same_winner,
        "reason_golden_first": golden_first.reason,
        "judge_model": ai_first.judge_model,
        "rubric_version": ai_first.rubric_version,
    }


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
    ai_summary: str,
    golden_summary: str,
) -> list[dict[str, Any]]:
    """Runs every pairwise rubric twice, once with each summary in the A slot.

    The judge only ever sees "Summary A (actual_output)" / "Summary B (expected_output)", so a
    preference for the first slot shows up as the two orders disagreeing (`consistent=False`)
    and cancels out in the averaged `score`, where higher favors the AI summary.

    The first spec judges against the source document, the second on summary quality alone,
    so they differ only in whether the test case carries the source text.
    """
    work = []
    for spec in _PAIRWISE_SPECS:
        source = source_text if LLMTestCaseParams.INPUT in spec.params else ""
        work += [
            (
                spec,
                LLMTestCase(input=source, actual_output=ai_summary, expected_output=golden_summary),
            ),
            (
                spec,
                LLMTestCase(input=source, actual_output=golden_summary, expected_output=ai_summary),
            ),
        ]
    results = await evaluate_geval(settings, work)

    return [
        combine_pairwise_orders(ai_first, golden_first)
        for ai_first, golden_first in zip(results[::2], results[1::2], strict=True)
    ]
