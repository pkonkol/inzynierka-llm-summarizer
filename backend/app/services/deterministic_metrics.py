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


# ---------------------------------------------------------------------------
# Individual metric functions
# ---------------------------------------------------------------------------

def flesch_kincaid_grade(text: str) -> float | None:
    """FK Grade Level — higher = harder. Good on source text."""
    try:
        return round(textstat.flesch_kincaid_grade(text), 2)
    except Exception:
        return None


def gunning_fog(text: str) -> float | None:
    """Gunning Fog index — years of education needed."""
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
    """TTR = unique tokens / total tokens (0–1)."""
    words = text.lower().split()
    if not words:
        return None
    return round(len(set(words)) / len(words), 4)


def lexical_density(text: str) -> float | None:
    """Content POS tokens / total tokens (spaCy). None if model unavailable."""
    nlp = _nlp()
    if nlp is None:
        return None
    try:
        doc = nlp(text)
        tokens = [t for t in doc if not t.is_space]
        if not tokens:
            return None
        content = sum(1 for t in tokens if t.pos_ in _CONTENT_POS)
        return round(content / len(tokens), 4)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Aggregate helpers
# ---------------------------------------------------------------------------

def source_metrics(text: str) -> dict[str, Any]:
    """Metrics for the scraped source article."""
    return {
        "flesch_kincaid_grade": flesch_kincaid_grade(text),
        "gunning_fog": gunning_fog(text),
        "automated_readability_index": automated_readability_index(text),
        "word_count": textstat.lexicon_count(text, removepunct=True),
        "sentence_count": textstat.sentence_count(text),
        "avg_sentence_length": avg_sentence_length(text),
    }


def summary_metrics(text: str) -> dict[str, Any]:
    """Metrics for the generated short_summary prose."""
    return {
        "automated_readability_index": automated_readability_index(text),
        "avg_sentence_length": avg_sentence_length(text),
        "type_token_ratio": type_token_ratio(text),
        "lexical_density": lexical_density(text),
        "word_count": textstat.lexicon_count(text, removepunct=True),
        "sentence_count": textstat.sentence_count(text),
    }


def key_takeaways_metrics(text: str) -> dict[str, Any]:
    """
    Simple structural metrics for the key_takeaways bullet list.
    Designed as a placeholder — extend with richer extraction metrics later.
    """
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    bullet_lines = [ln for ln in lines if ln.startswith(("- ", "* ", "• ")) or (len(ln) > 2 and ln[0].isdigit() and ln[1] in ".)" )]
    words = text.lower().split()
    unique_words = set(words)
    avg_bullet_words = (
        round(sum(len(ln.split()) for ln in bullet_lines) / len(bullet_lines), 2)
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
    """
    Cross-text metrics comparing source and summary.
    Both word-based and char-based ratios included.
    """
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
