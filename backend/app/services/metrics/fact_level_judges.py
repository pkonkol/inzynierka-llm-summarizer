"""Fact-level summary judges after FineSurE (Song et al. 2024, arXiv 2407.00908).

Every summary sentence is fact-checked against the source, and every key fact of the source is
aligned to the sentences that carry it; faithfulness, completeness, conciseness and repetition
are counted from those two judgements.
"""

from __future__ import annotations

from dataclasses import dataclass

from ...schemas.judges import (
    AlignmentJudgement,
    FactLevelResult,
    FactLevelScores,
    FaithfulnessJudgement,
)


@dataclass(frozen=True, slots=True)
class JudgeModelRef:
    """Provider and pinned model id of the LLM acting as judge."""

    provider: str
    name: str


def split_sentences(text: str, language: str) -> list[str]:
    """Sentence split shared by the labelling page and every judge, so sentence indices line up."""
    raise NotImplementedError


async def extract_keyfacts(source_text: str, language: str, judge: JudgeModelRef) -> list[str]:
    """Up to 16 key facts of the source, one short sentence each (REALSum guideline)."""
    raise NotImplementedError


async def check_faithfulness(
    source_text: str, sentences: list[str], judge: JudgeModelRef
) -> FaithfulnessJudgement:
    """One verdict per summary sentence: supported by the source or not, with error type and reason."""
    raise NotImplementedError


async def align_keyfacts(
    keyfacts: list[str], sentences: list[str], judge: JudgeModelRef
) -> AlignmentJudgement:
    """For every key fact: present in the summary or not, and which sentences carry it."""
    raise NotImplementedError


def fact_level_scores(
    faithfulness: FaithfulnessJudgement, alignment: AlignmentJudgement, sentence_count: int
) -> FactLevelScores:
    """Faithfulness, completeness, conciseness (new key fact only) and repetition from the two judgements."""
    raise NotImplementedError


async def judge_fact_level(
    source_text: str, summary: str, keyfacts: list[str], language: str, judge: JudgeModelRef
) -> FactLevelResult:
    """Split the summary, run both judges, count the scores."""
    raise NotImplementedError
