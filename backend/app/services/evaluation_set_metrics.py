from __future__ import annotations

from dataclasses import asdict
from typing import Any

import textstat

from app.core.config import settings
from app.services.metrics.deepeval import (
    evaluate_summary_input_metrics,
    evaluate_summary_metrics,
)


def build_text_stats(text: str) -> dict[str, Any]:
    words = text.split()
    sentences = [part for part in text.replace("!", ".").replace("?", ".").split(".") if part.strip()]

    return {
        "char_count": len(text),
        "word_count": len(words),
        "sentence_count": len(sentences),
        "avg_words_per_sentence": round(len(words) / len(sentences), 4) if sentences else 0,
    }


def build_readability(text: str) -> dict[str, Any]:
    return {
        "flesch_reading_ease": textstat.flesch_reading_ease(text),
        "flesch_kincaid_grade": textstat.flesch_kincaid_grade(text),
        "gunning_fog": textstat.gunning_fog(text),
        "smog_index": textstat.smog_index(text),
        "coleman_liau_index": textstat.coleman_liau_index(text),
        "automated_readability_index": textstat.automated_readability_index(text),
        "text_standard": textstat.text_standard(text, float_output=True),
    }


async def build_golden_metrics(input_text: str, golden_summary: str) -> dict[str, Any]:
    summary_results = await evaluate_summary_metrics(settings, golden_summary)
    summary_input_results = await evaluate_summary_input_metrics(
        settings=settings,
        article_text=input_text,
        summary=golden_summary,
    )

    return {
        "text_stats": build_text_stats(golden_summary),
        "readability": build_readability(golden_summary),
        "deepeval": {
            "summary": [asdict(x) for x in summary_results],
            "summary_input": [asdict(x) for x in summary_input_results],
        },
    }