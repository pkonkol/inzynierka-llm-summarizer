"""
Text quality metrics for source articles and generated summaries.

Source metrics       : readability (FK, Fog, ARI), word/sentence counts.
Summary metrics      : readability battery, TTR, lexical density, word/sentence counts,
                        and compression ratio against the source text (word_ratio, char_ratio).
Key-takeaways metrics: simple structural metrics (sentence count, avg length, bullet count).

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


def flesch_reading_ease(text: str) -> float:
    return round(textstat.flesch_reading_ease(text), 2)


def flesch_kincaid_grade(text: str) -> float:
    return round(textstat.flesch_kincaid_grade(text), 2)


def gunning_fog(text: str) -> float:
    return round(textstat.gunning_fog(text), 2)


def smog_index(text: str) -> float:
    return round(textstat.smog_index(text), 2)


def coleman_liau_index(text: str) -> float:
    return round(textstat.coleman_liau_index(text), 2)


def text_standard(text: str) -> float:
    return textstat.text_standard(text, float_output=True)


def automated_readability_index(text: str) -> float:
    return round(textstat.automated_readability_index(text), 2)


def avg_sentence_length(text: str) -> float:
    sentences = textstat.sentence_count(text)
    words = textstat.lexicon_count(text, removepunct=True)
    return round(words / sentences, 2)


def type_token_ratio(text: str) -> float:
    words = text.lower().split()
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


def summary_metrics(text: str, source_text: str) -> dict[str, Any]:
    source_word_count = textstat.lexicon_count(source_text, removepunct=True)
    summary_word_count = textstat.lexicon_count(text, removepunct=True)
    source_char_count = len(source_text.replace(" ", ""))
    summary_char_count = len(text.replace(" ", ""))

    return {
        "word_count": summary_word_count,
        "sentence_count": textstat.sentence_count(text),
        "avg_sentence_length": avg_sentence_length(text),
        "type_token_ratio": type_token_ratio(text),
        "lexical_density": lexical_density(text),
        "flesch_reading_ease": flesch_reading_ease(text),
        "flesch_kincaid_grade": flesch_kincaid_grade(text),
        "gunning_fog": gunning_fog(text),
        "smog_index": smog_index(text),
        "coleman_liau_index": coleman_liau_index(text),
        "automated_readability_index": automated_readability_index(text),
        "text_standard": text_standard(text),
        "source_word_count": source_word_count,
        "word_ratio": round(summary_word_count / source_word_count, 4),
        "char_ratio": round(summary_char_count / source_char_count, 4),
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
