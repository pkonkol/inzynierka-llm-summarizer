from __future__ import annotations

from nltk.translate.meteor_score import meteor_score
from rouge_score import rouge_scorer

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
