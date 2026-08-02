from __future__ import annotations

import asyncio
from typing import Any
from typing import Literal

from nltk.translate.meteor_score import meteor_score
from pydantic import BaseModel
from rouge_score import rouge_scorer

from app.core.config import Settings

from .deepeval import build_deepeval_model

_ROUGE_SCORER = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)


class PairwiseJudgeResult(BaseModel):
    winner: Literal["A", "B", "tie"]
    score_A: float
    score_B: float
    reason: str


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


def _pairwise_prompt_with_input(source_text: str, summary_a: str, summary_b: str) -> str:
    return f"""
Evaluate which summary better summarizes the source document.
Consider faithfulness to source, coverage of key information, coherence, and readability.

Respond with strict JSON only:
{{
  "winner": "A" | "B" | "tie",
  "score_A": number in [0, 1],
  "score_B": number in [0, 1],
  "reason": "short explanation (2-3 sentences)"
}}

Source:
{source_text}

Summary A:
{summary_a}

Summary B:
{summary_b}
""".strip()


def _pairwise_prompt_without_input(summary_a: str, summary_b: str) -> str:
    return f"""
Evaluate which summary is better based only on writing quality and informational value.
Consider coherence, readability, fluency, factual density, and usefulness.

Respond with strict JSON only:
{{
  "winner": "A" | "B" | "tie",
  "score_A": number in [0, 1],
  "score_B": number in [0, 1],
  "reason": "short explanation (2-3 sentences)"
}}

Summary A:
{summary_a}

Summary B:
{summary_b}
""".strip()


async def evaluate_pairwise_cross_deepeval(
    settings: Settings,
    source_text: str,
    summary_a: str,
    summary_b: str,
) -> list[dict[str, Any]]:
    model = build_deepeval_model(settings)
    with_input_prompt = _pairwise_prompt_with_input(source_text, summary_a, summary_b)
    without_input_prompt = _pairwise_prompt_without_input(summary_a, summary_b)

    with_input_result, without_input_result = await asyncio.gather(
        asyncio.to_thread(model.generate, with_input_prompt, PairwiseJudgeResult),
        asyncio.to_thread(model.generate, without_input_prompt, PairwiseJudgeResult),
    )

    with_input_json = with_input_result[0]
    without_input_json = without_input_result[0]

    return [
        {
            "name": "pairwise_with_input",
            "winner": with_input_json.winner,
            "score_A": round(with_input_json.score_A, 4),
            "score_B": round(with_input_json.score_B, 4),
            "reason": with_input_json.reason,
        },
        {
            "name": "pairwise_without_input",
            "winner": without_input_json.winner,
            "score_A": round(without_input_json.score_A, 4),
            "score_B": round(without_input_json.score_B, 4),
            "reason": without_input_json.reason,
        },
    ]
