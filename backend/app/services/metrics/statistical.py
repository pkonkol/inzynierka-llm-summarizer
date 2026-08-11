"""
Statistical text metrics — fast, local computations (no LLM involved).

Contrasts with the GEval/deepeval metrics, which require an LLM judge and a budget.

Length is measured in characters throughout. Readability uses Flesch-Kincaid grade
(the best empirically validated formula) plus text_standard as a consensus sanity check.
"""
from typing import Any

import textstat


def flesch_kincaid_grade(text: str) -> float:
    return round(textstat.flesch_kincaid_grade(text), 2)


def text_standard(text: str) -> float:
    # Consensus (mode) across textstat's readability formulas, clamped by textstat to 1-18,
    # so very hard texts cap at 18 even when flesch_kincaid_grade goes higher.
    return textstat.text_standard(text, float_output=True)


def source_metrics(text: str) -> dict[str, Any]:
    return {
        "char_count": len(text),
        "flesch_kincaid_grade": flesch_kincaid_grade(text),
        "text_standard": text_standard(text),
    }


def summary_metrics(text: str, source_text: str) -> dict[str, Any]:
    return {
        "char_count": len(text),
        "flesch_kincaid_grade": flesch_kincaid_grade(text),
        "text_standard": text_standard(text),
        "length_ratio": round(len(text) / len(source_text), 4),
    }


def key_takeaways_metrics(text: str) -> dict[str, Any]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    bullet_lines = [
        line for line in lines
        if line.startswith(("- ", "* ", "• ")) or (len(line) > 2 and line[0].isdigit() and line[1] in ".)")
    ]
    return {
        "bullet_count": len(bullet_lines),
        "char_count": len(text),
    }
