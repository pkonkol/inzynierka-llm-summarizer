"""
Text quality metrics for source articles and generated summaries.

Source metrics  : readability (FK, Fog, ARI) — measure how hard the article is to read.
Summary metrics : avg sentence length, TTR, lexical density, ARI.
Shared metrics  : compression_ratio (requires both).

Lexical density uses spaCy; all other metrics use textstat or pure Python.
spaCy model is loaded lazily on first call — no startup cost if metrics are unused.
"""

import logging
from functools import lru_cache
from typing import Any

import textstat

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# spaCy — lazy singleton
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _nlp():
    """Load spaCy model once. Requires: python -m spacy download en_core_web_sm"""
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
    """FK Grade Level — higher = harder to read. Meaningful on source and summary."""
    try:
        return round(textstat.flesch_kincaid_grade(text), 2)
    except Exception:
        return None


def gunning_fog(text: str) -> float | None:
    """Gunning Fog index — years of formal education needed. Best on source text."""
    try:
        return round(textstat.gunning_fog(text), 2)
    except Exception:
        return None


def automated_readability_index(text: str) -> float | None:
    """ARI — similar to FK, character-based formula. Usable on source and summary."""
    try:
        return round(textstat.automated_readability_index(text), 2)
    except Exception:
        return None


def avg_sentence_length(text: str) -> float | None:
    """Average number of words per sentence."""
    try:
        sentences = textstat.sentence_count(text)
        words = textstat.lexicon_count(text, removepunct=True)
        if sentences == 0:
            return None
        return round(words / sentences, 2)
    except Exception:
        return None


def type_token_ratio(text: str) -> float | None:
    """TTR = unique tokens / total tokens. Proxy for lexical diversity (0–1)."""
    words = text.lower().split()
    if not words:
        return None
    return round(len(set(words)) / len(words), 4)


def lexical_density(text: str) -> float | None:
    """
    Lexical density = content POS tokens / total tokens (spaCy).
    Content POS: NOUN, VERB, ADJ, ADV.
    Returns None if spaCy model is unavailable.
    """
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


def compression_ratio(source: str, summary: str) -> float | None:
    """
    summary word count / source word count.
    < 1.0 means summary is shorter (expected).
    Returns None if source is empty.
    """
    src_words = len(source.split())
    sum_words = len(summary.split())
    if src_words == 0:
        return None
    return round(sum_words / src_words, 4)


# ---------------------------------------------------------------------------
# Aggregate helpers
# ---------------------------------------------------------------------------

def source_metrics(text: str) -> dict[str, Any]:
    """All metrics that apply to the source article."""
    return {
        "flesch_kincaid_grade": flesch_kincaid_grade(text),
        "gunning_fog": gunning_fog(text),
        "automated_readability_index": automated_readability_index(text),
        "word_count": textstat.lexicon_count(text, removepunct=True),
        "sentence_count": textstat.sentence_count(text),
        "avg_sentence_length": avg_sentence_length(text),
    }


def summary_metrics(text: str) -> dict[str, Any]:
    """All metrics that apply to the generated summary."""
    return {
        "automated_readability_index": automated_readability_index(text),
        "avg_sentence_length": avg_sentence_length(text),
        "type_token_ratio": type_token_ratio(text),
        "lexical_density": lexical_density(text),
        "word_count": textstat.lexicon_count(text, removepunct=True),
        "sentence_count": textstat.sentence_count(text),
    }


def compute_all(source: str, summary: str) -> dict[str, Any]:
    """
    Compute all basic metrics at once.
    Returns nested dict: {source: {...}, summary: {...}, shared: {...}}
    """
    return {
        "source": source_metrics(source),
        "summary": summary_metrics(summary),
        "shared": {
            "compression_ratio": compression_ratio(source, summary),
        },
    }
