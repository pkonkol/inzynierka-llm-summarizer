"""
Statistical text metrics — fast, local computations (no LLM involved).

Contrasts with the GEval/deepeval metrics, which require an LLM judge and a budget.

Length is measured in characters throughout. Readability uses Flesch-Kincaid grade, the
best empirically validated of the classic formulas.
"""

from typing import Any

import textstat


def flesch_kincaid_grade(text: str) -> float:
    return round(textstat.flesch_kincaid_grade(text), 2)


def source_metrics(text: str) -> dict[str, Any]:
    return {
        "char_count": len(text),
        "flesch_kincaid_grade": flesch_kincaid_grade(text),
    }


def summary_metrics(text: str, source_text: str) -> dict[str, Any]:
    return {
        "char_count": len(text),
        "flesch_kincaid_grade": flesch_kincaid_grade(text),
        "length_ratio": round(len(text) / len(source_text), 4),
    }
