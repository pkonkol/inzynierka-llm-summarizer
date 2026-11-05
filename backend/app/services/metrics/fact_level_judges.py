"""Fact-level summary judges after FineSurE (Song et al. 2024, arXiv 2407.00908).

Every summary sentence is fact-checked against the source, and every key fact of the source is
aligned to the sentences that carry it; faithfulness, completeness, conciseness and repetition
are counted from those two judgements.
"""

from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass
from functools import cache
from typing import Any

import structlog
from langchain_core.prompts import ChatPromptTemplate
from nltk.tokenize.punkt import PunktTokenizer

from ...schemas.judges import (
    AlignmentJudgement,
    ExtractedKeyfacts,
    FactLevelResult,
    FactLevelScores,
    FaithfulnessJudgement,
)
from ...schemas.usage import UsageMetadata
from ..llm._base import LlmOutputError, build_structured_llm, parse_structured_output
from .judge_prompts import (
    ALIGNMENT_PROMPT,
    FAITHFULNESS_PROMPT,
    KEYFACT_PROMPT,
    judge_prompt_version,
    prompt_wording,
)

log = structlog.get_logger(__name__)

MAX_KEYFACTS = 16
FACT_LEVEL_PROMPT_VERSION = "+".join(
    judge_prompt_version(prompt_wording(prompt))
    for prompt in (FAITHFULNESS_PROMPT, ALIGNMENT_PROMPT)
)

_PUNKT_LANGUAGES = {"en": "english", "pl": "polish"}
# Titles before a name that the Polish Punkt table lacks, so "Dr. Kowalski" stays one sentence.
_EXTRA_ABBREVIATIONS = {"en": set(), "pl": {"dr", "mgr", "płk"}}
_MARKDOWN_HEADING = re.compile(r"#{1,6}\s")
_LIST_ITEM_MARKER = re.compile(r"(?:[-*+]|\d+[.)])\s+")


@dataclass(frozen=True, slots=True)
class JudgeModelRef:
    """Provider and pinned model id of the LLM acting as judge."""

    provider: str
    name: str

    def model_id(self) -> str:
        return f"{self.provider}:{self.name}"


def _as_data(text: str, tag: str) -> str:
    """Closing tags inside the text cannot end the data block the prompt wraps it in."""
    return text.replace(f"</{tag}", f"&lt;/{tag}")


def _numbered(lines: list[str]) -> str:
    return "\n".join(f"[{index}] {line}" for index, line in enumerate(lines))


async def ask_judge(
    prompt: ChatPromptTemplate,
    structure: type,
    variables: dict[str, Any],
    judge: JudgeModelRef,
    stage: str,
) -> tuple[Any, UsageMetadata]:
    """One structured call to the judge model; every judge in this package goes through it."""
    log.debug("judge call", stage=stage, provider=judge.provider, model=judge.name)
    started = time.monotonic()

    llm = build_structured_llm(structure, judge.provider, judge.name)
    raw = await (prompt | llm).ainvoke(variables)
    parsed, _raw_str, usage, _raw_metadata = parse_structured_output(raw, "judge", stage)

    log.info(
        "judge answered",
        stage=stage,
        provider=judge.provider,
        model=judge.name,
        duration_ms=round((time.monotonic() - started) * 1000),
        token_usage=usage.total_tokens,
    )
    return parsed, usage


@cache
def _sentence_tokenizer(language: str) -> PunktTokenizer:
    tokenizer = PunktTokenizer(_PUNKT_LANGUAGES[language])
    tokenizer._params.abbrev_types.update(_EXTRA_ABBREVIATIONS[language])
    return tokenizer


def _text_blocks(text: str) -> list[str]:
    """Paragraphs and list items of a markdown text, headings dropped; each block ends a sentence."""
    blocks: list[str] = []
    paragraph: list[str] = []

    for raw_line in text.splitlines():
        line = raw_line.strip()
        list_item = _LIST_ITEM_MARKER.match(line)
        ends_paragraph = not line or _MARKDOWN_HEADING.match(line) or list_item
        if ends_paragraph and paragraph:
            blocks.append(" ".join(paragraph))
            paragraph = []
        if list_item:
            blocks.append(line[list_item.end() :])
        elif line and not ends_paragraph:
            paragraph.append(line)

    if paragraph:
        blocks.append(" ".join(paragraph))
    return blocks


def split_sentences(text: str, language: str) -> list[str]:
    """Sentence split shared by the labelling page and every judge, so sentence indices line up."""
    if language not in _PUNKT_LANGUAGES:
        raise ValueError(f"no sentence splitter for language {language!r}")
    if not text.strip():
        raise ValueError("text must not be blank")

    tokenizer = _sentence_tokenizer(language)
    return [sentence for block in _text_blocks(text) for sentence in tokenizer.tokenize(block)]


async def extract_keyfacts(source_text: str, language: str, judge: JudgeModelRef) -> list[str]:
    """Up to 16 key facts of the source, one short sentence each (REALSum guideline)."""
    extracted, _usage = await ask_judge(
        KEYFACT_PROMPT,
        ExtractedKeyfacts,
        {
            "max_keyfacts": MAX_KEYFACTS,
            "language": language,
            "source": _as_data(source_text, "source"),
        },
        judge,
        "keyfacts",
    )
    keyfacts = [keyfact.strip() for keyfact in extracted.keyfacts if keyfact.strip()]
    if not keyfacts or len(keyfacts) > MAX_KEYFACTS:
        raise LlmOutputError(
            f"keyfact extraction returned {len(keyfacts)} key facts, expected 1..{MAX_KEYFACTS}",
            raw_output=str(extracted.keyfacts),
        )
    return keyfacts


async def check_faithfulness(
    source_text: str, sentences: list[str], judge: JudgeModelRef
) -> tuple[FaithfulnessJudgement, UsageMetadata]:
    """One verdict per summary sentence: supported by the source or not, with error type and reason."""
    return await ask_judge(
        FAITHFULNESS_PROMPT,
        FaithfulnessJudgement,
        {"source": _as_data(source_text, "source"), "numbered_sentences": _numbered(sentences)},
        judge,
        "faithfulness",
    )


async def align_keyfacts(
    keyfacts: list[str], sentences: list[str], judge: JudgeModelRef
) -> tuple[AlignmentJudgement, UsageMetadata]:
    """For every key fact: present in the summary or not, and which sentences carry it."""
    return await ask_judge(
        ALIGNMENT_PROMPT,
        AlignmentJudgement,
        {"numbered_keyfacts": _numbered(keyfacts), "numbered_sentences": _numbered(sentences)},
        judge,
        "alignment",
    )


def _require_consistent_judgements(
    faithfulness: FaithfulnessJudgement, alignment: AlignmentJudgement, sentence_count: int
) -> None:
    if sentence_count == 0:
        raise ValueError("summary has no sentences")
    if not alignment.keyfacts:
        raise ValueError("no key facts to align")

    judged_sentences = sorted(verdict.sentence_index for verdict in faithfulness.sentences)
    if judged_sentences != list(range(sentence_count)):
        raise ValueError(
            f"faithfulness judged sentences {judged_sentences}, expected 0..{sentence_count - 1}"
        )

    for match in alignment.keyfacts:
        if match.present != bool(match.sentence_indices):
            raise ValueError(
                f"key fact {match.keyfact_index}: present={match.present} "
                f"with sentences {match.sentence_indices}"
            )
        outside = [index for index in match.sentence_indices if not 0 <= index < sentence_count]
        if outside:
            raise ValueError(
                f"key fact {match.keyfact_index} aligned to missing sentences {outside}"
            )


def fact_level_scores(
    faithfulness: FaithfulnessJudgement, alignment: AlignmentJudgement, sentence_count: int
) -> FactLevelScores:
    """Faithfulness, completeness, conciseness (new key fact only) and repetition from the two judgements."""
    _require_consistent_judgements(faithfulness, alignment, sentence_count)

    present_keyfacts = [match for match in alignment.keyfacts if match.present]
    sentences_with_new_keyfact = {min(match.sentence_indices) for match in present_keyfacts}
    sentences_with_any_keyfact = {
        index for match in present_keyfacts for index in match.sentence_indices
    }
    repeated_sentence_indices = sorted(sentences_with_any_keyfact - sentences_with_new_keyfact)
    faithful_sentences = sum(verdict.faithful for verdict in faithfulness.sentences)

    return FactLevelScores(
        faithfulness=faithful_sentences / sentence_count,
        completeness=len(present_keyfacts) / len(alignment.keyfacts),
        conciseness=len(sentences_with_new_keyfact) / sentence_count,
        has_repetition=bool(repeated_sentence_indices),
        repeated_sentence_indices=repeated_sentence_indices,
    )


async def judge_fact_level(
    source_text: str, summary: str, keyfacts: list[str], language: str, judge: JudgeModelRef
) -> FactLevelResult:
    """Split the summary, run both judges, count the scores."""
    sentences = split_sentences(summary, language)
    (faithfulness, faithfulness_usage), (alignment, alignment_usage) = await asyncio.gather(
        check_faithfulness(source_text, sentences, judge),
        align_keyfacts(keyfacts, sentences, judge),
    )
    return FactLevelResult(
        scores=fact_level_scores(faithfulness, alignment, len(sentences)),
        faithfulness=faithfulness,
        alignment=alignment,
        judge_model=judge.model_id(),
        prompt_version=FACT_LEVEL_PROMPT_VERSION,
        usage=faithfulness_usage + alignment_usage,
    )
