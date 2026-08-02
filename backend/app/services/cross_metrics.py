from __future__ import annotations

from typing import Any

from nltk.translate.meteor_score import meteor_score
from rouge_score import rouge_scorer


class _NoWordNet:
    def synsets(self, *_args: Any, **_kwargs: Any) -> list[Any]:
        return []


_NO_WORDNET = _NoWordNet()
_ROUGE_SCORER = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)


def compute_cross_metrics(reference_text: str, summary_text: str) -> dict[str, float | None]:
    reference = (reference_text or "").strip()
    summary = (summary_text or "").strip()

    if not reference or not summary:
        return {
            "rouge1": None,
            "rouge2": None,
            "rougeL": None,
            "meteor": None,
        }

    rouge = _ROUGE_SCORER.score(reference, summary)

    reference_tokens = reference.lower().split()
    summary_tokens = summary.lower().split()
    meteor = meteor_score([reference_tokens], summary_tokens, wordnet=_NO_WORDNET)

    return {
        "rouge1": round(rouge["rouge1"].fmeasure, 4),
        "rouge2": round(rouge["rouge2"].fmeasure, 4),
        "rougeL": round(rouge["rougeL"].fmeasure, 4),
        "meteor": round(meteor, 4),
    }
