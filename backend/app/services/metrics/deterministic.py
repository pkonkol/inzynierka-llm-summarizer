"""
Text quality metrics for source articles and generated summaries.

Source metrics       : readability (FK, Fog, ARI), word/sentence counts.
Summary metrics      : ARI, avg sentence length, TTR, lexical density, word/sentence counts.
Key-takeaways metrics: simple structural metrics (sentence count, avg length, bullet count).
Cross metrics        : compression_ratio (summary vs source).

spaCy model is loaded lazily on first call.
"""
import logging
from functools import lru_cache
from typing import Any

import textstat

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _nlp():
    import spacy  # noqa: PLC0415

    try:
        return spacy.load("en_core_web_sm", disable=["parser", "ner"])
    except OSError:
        logger.warning("spaCy model 'en_core_web_sm' not found — lexical_density will be None")
        return None


_CONTENT_POS = {"NOUN", "VERB", "ADJ", "ADV"}


def flesch_kincaid_grade(text: str) -> float | None:
    try:
        return round(textstat.flesch_kincaid_grade(text), 2)
    except Exception:
        return None


def gunning_fog(text: str) -> float | None:
    try:
        return round(textstat.gunning_fog(text), 2)
    except Exception:
        return None


def automated_readability_index(text: str) -> float | None:
    try:
        return round(textstat.automated_readability_index(text), 2)
    except Exception:
        return None


def avg_sentence_length(text: str) -> float | None:
    try:
        sentences = textstat.sentence_count(text)
        words = textstat.lexicon_count(text, removepunct=True)
        if sentences == 0:
            return None
        return round(words / sentences, 2)
    except Exception:
        return None


def type_token_ratio(text: str) -> float | None:
    words = text.lower().split()
    if not words:
        return None
    return round(len(set(words)) / len(words), 4)


def lexical_density(text: str) -> float | None:
    nlp = _nlp()
    if nlp is None:
        return None
    try:
        doc = nlp(text)
        tokens = [token for token in doc if not token.is_space]
        if not tokens:
            return None
        content = sum(1 for token in tokens if token.pos_ in _CONTENT_POS)
        return round(content / len(tokens), 4)
    except Exception:
        return None


def source_metrics(text: str) -> dict[str, Any]:
    return {
        "flesch_kincaid_grade": flesch_kincaid_grade(text),
        "gunning_fog": gunning_fog(text),
        "automated_readability_index": automated_readability_index(text),
        "word_count": textstat.lexicon_count(text, removepunct=True),
        "sentence_count": textstat.sentence_count(text),
        "avg_sentence_length": avg_sentence_length(text),
    }


def summary_metrics(text: str) -> dict[str, Any]:
    return {
        "automated_readability_index": automated_readability_index(text),
        "avg_sentence_length": avg_sentence_length(text),
        "type_token_ratio": type_token_ratio(text),
        "lexical_density": lexical_density(text),
        "word_count": textstat.lexicon_count(text, removepunct=True),
        "sentence_count": textstat.sentence_count(text),
    }


def key_takeaways_metrics(text: str) -> dict[str, Any]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    bullet_lines = [line for line in lines if line.startswith(("- ", "* ", "• ")) or (len(line) > 2 and line[0].isdigit() and line[1] in ".)")]
    words = text.lower().split()
    unique_words = set(words)
    avg_bullet_words = (
        round(sum(len(line.split()) for line in bullet_lines) / len(bullet_lines), 2)
        if bullet_lines else None
    )
    return {
        "bullet_count": len(bullet_lines),
        "total_lines": len(lines),
        "word_count": len(words),
        "unique_word_count": len(unique_words),
        "type_token_ratio": round(len(unique_words) / len(words), 4) if words else None,
        "avg_bullet_word_count": avg_bullet_words,
    }


def compression_ratio_metrics(source: str, summary: str) -> dict[str, Any]:
    src_words = textstat.lexicon_count(source, removepunct=True)
    sum_words = textstat.lexicon_count(summary, removepunct=True)
    src_chars = len(source.replace(" ", ""))
    sum_chars = len(summary.replace(" ", ""))
    return {
        "summary_word_count": sum_words,
        "source_word_count": src_words,
        "word_ratio": round(sum_words / src_words, 4) if src_words else None,
        "char_ratio": round(sum_chars / src_chars, 4) if src_chars else None,
    }
