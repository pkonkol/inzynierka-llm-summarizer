"""Cases cs1-cs15 and review rv3: fact-level scores from the two judgements, the alignment answer check, and the shared sentence split."""

import pytest

from app.schemas.judges import (
    AlignmentJudgement,
    FaithfulnessJudgement,
    KeyfactMatch,
    SentenceFaithfulness,
)
from app.schemas.usage import UsageMetadata
from app.services.llm import LlmOutputError
from app.services.metrics import fact_level_judges
from app.services.metrics.fact_level_judges import (
    JudgeModelRef,
    align_keyfacts,
    fact_level_scores,
    split_sentences,
)


def _faithfulness(*verdicts: bool) -> FaithfulnessJudgement:
    return FaithfulnessJudgement(
        sentences=[
            SentenceFaithfulness(
                sentence_index=index,
                faithful=faithful,
                error_type=None if faithful else "unsupported",
                reason="",
            )
            for index, faithful in enumerate(verdicts)
        ]
    )


def _alignment(*carriers: list[int]) -> AlignmentJudgement:
    """One argument per key fact: the sentences that carry it, empty when it is missing."""
    return AlignmentJudgement(
        keyfacts=[
            KeyfactMatch(keyfact_index=index, present=bool(sentences), sentence_indices=sentences)
            for index, sentences in enumerate(carriers)
        ]
    )


def test_case_1_every_sentence_with_a_new_keyfact() -> None:
    scores = fact_level_scores(
        _faithfulness(True, True, False, True, True),
        _alignment([0], [1], [2], [3], [4], [0], [], []),
        sentence_count=5,
    )

    assert scores.faithfulness == pytest.approx(0.8)
    assert scores.completeness == pytest.approx(0.75)
    assert scores.conciseness == pytest.approx(1.0)
    assert scores.has_repetition is False
    assert scores.repeated_sentence_indices == []


def test_case_2_sentence_with_only_earlier_keyfacts_is_a_repetition() -> None:
    scores = fact_level_scores(
        _faithfulness(True, True, True, True),
        _alignment([0, 3], [1], [2]),
        sentence_count=4,
    )

    assert scores.has_repetition is True
    assert scores.repeated_sentence_indices == [3]
    assert scores.conciseness == pytest.approx(0.75)


def test_case_3_sentence_without_keyfact_lowers_conciseness_only() -> None:
    scores = fact_level_scores(
        _faithfulness(True, True, True),
        _alignment([0], [1]),
        sentence_count=3,
    )

    assert scores.conciseness == pytest.approx(2 / 3)
    assert scores.has_repetition is False
    assert scores.repeated_sentence_indices == []


def test_case_4_sentence_with_an_old_and_a_new_keyfact_counts() -> None:
    scores = fact_level_scores(
        _faithfulness(True, True, True),
        _alignment([0, 2], [1], [2]),
        sentence_count=3,
    )

    assert scores.conciseness == pytest.approx(1.0)
    assert scores.has_repetition is False


def test_case_5_order_of_keyfacts_in_the_judge_answer_does_not_matter() -> None:
    faithfulness = _faithfulness(True, True, True, True)
    alignment = _alignment([1], [2], [3, 0])
    shuffled = AlignmentJudgement(keyfacts=list(reversed(alignment.keyfacts)))

    assert fact_level_scores(faithfulness, shuffled, 4) == fact_level_scores(
        faithfulness, alignment, 4
    )
    assert fact_level_scores(faithfulness, alignment, 4).repeated_sentence_indices == [3]


def test_case_6_missing_faithfulness_verdict_is_rejected() -> None:
    with pytest.raises(ValueError):
        fact_level_scores(
            _faithfulness(True, True, True, True), _alignment([0], [1]), sentence_count=5
        )


@pytest.mark.parametrize(
    ("faithfulness", "alignment"),
    [
        pytest.param(
            FaithfulnessJudgement(
                sentences=[
                    SentenceFaithfulness(
                        sentence_index=0, faithful=True, error_type=None, reason=""
                    ),
                    SentenceFaithfulness(
                        sentence_index=7, faithful=True, error_type=None, reason=""
                    ),
                ]
            ),
            _alignment([0], [1]),
            id="case_7_faithfulness_index",
        ),
        pytest.param(
            _faithfulness(True, True),
            _alignment([0], [9]),
            id="case_7_alignment_index",
        ),
    ],
)
def test_case_7_sentence_index_out_of_range_is_rejected(
    faithfulness: FaithfulnessJudgement, alignment: AlignmentJudgement
) -> None:
    with pytest.raises(ValueError):
        fact_level_scores(faithfulness, alignment, sentence_count=2)


@pytest.mark.parametrize(
    "match",
    [
        pytest.param(
            KeyfactMatch(keyfact_index=1, present=True, sentence_indices=[]),
            id="case_8_present_without_sentence",
        ),
        pytest.param(
            KeyfactMatch(keyfact_index=1, present=False, sentence_indices=[1]),
            id="case_8_missing_with_sentence",
        ),
    ],
)
def test_case_8_contradictory_keyfact_match_is_rejected(match: KeyfactMatch) -> None:
    alignment = AlignmentJudgement(
        keyfacts=[KeyfactMatch(keyfact_index=0, present=True, sentence_indices=[0]), match]
    )

    with pytest.raises(ValueError):
        fact_level_scores(_faithfulness(True, True), alignment, sentence_count=2)


@pytest.mark.parametrize(
    ("faithfulness", "alignment", "sentence_count"),
    [
        pytest.param(_faithfulness(True), _alignment(), 1, id="case_9_no_keyfacts"),
        pytest.param(_faithfulness(), _alignment([]), 0, id="case_9_no_sentences"),
    ],
)
def test_case_9_empty_summary_or_keyfacts_is_rejected(
    faithfulness: FaithfulnessJudgement, alignment: AlignmentJudgement, sentence_count: int
) -> None:
    with pytest.raises(ValueError):
        fact_level_scores(faithfulness, alignment, sentence_count)


def test_case_10_english_sentences_are_split_unchanged() -> None:
    sentences = split_sentences("The cat sat. The dog ran away. Birds flew south.", "en")

    assert sentences == ["The cat sat.", "The dog ran away.", "Birds flew south."]


def test_case_11_polish_abbreviations_do_not_end_a_sentence() -> None:
    sentences = split_sentences(
        "Dr. Kowalski przyjechał o godz. 12. Potem wyjechał, tj. wrócił do domu.", "pl"
    )

    assert sentences == [
        "Dr. Kowalski przyjechał o godz. 12.",
        "Potem wyjechał, tj. wrócił do domu.",
    ]


def test_case_12_markdown_list_items_are_sentences_and_headings_are_dropped() -> None:
    summary = (
        "Rząd przyjął budżet.\n\n"
        "## Powiązane źródła\n\n"
        "- pierwszy punkt bez kropki\n"
        "- drugi punkt bez kropki"
    )

    assert split_sentences(summary, "pl") == [
        "Rząd przyjął budżet.",
        "pierwszy punkt bez kropki",
        "drugi punkt bez kropki",
    ]


def test_case_13_paragraph_break_always_ends_a_sentence() -> None:
    sentences = split_sentences("First paragraph without a full stop\n\nSecond paragraph.", "en")

    assert sentences == ["First paragraph without a full stop", "Second paragraph."]


@pytest.mark.parametrize(
    "text",
    [pytest.param("", id="case_14_empty"), pytest.param("  \n\t ", id="case_14_whitespace")],
)
def test_case_14_blank_text_is_rejected(text: str) -> None:
    with pytest.raises(ValueError):
        split_sentences(text, "en")


def test_case_15_unsupported_language_is_rejected() -> None:
    with pytest.raises(ValueError):
        split_sentences("Der Hund lief weg.", "de")


@pytest.mark.parametrize(
    "carriers",
    [
        pytest.param(([0],), id="rv3_keyfact_left_out"),
        pytest.param(([0], [1], [0]), id="rv3_index_past_the_keyfacts"),
    ],
)
async def test_rv3_alignment_must_cover_every_keyfact_once(
    monkeypatch: pytest.MonkeyPatch, carriers: tuple[list[int], ...]
) -> None:
    async def answer(*_args: object) -> tuple[AlignmentJudgement, UsageMetadata]:
        return _alignment(*carriers), UsageMetadata()

    monkeypatch.setattr(fact_level_judges, "ask_judge", answer)

    with pytest.raises(LlmOutputError):
        await align_keyfacts(
            ["Alpha rose.", "Beta fell."], ["Alpha rose.", "Beta fell."], JudgeModelRef("x", "y")
        )


async def test_rv3_alignment_in_any_order_is_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    alignment = AlignmentJudgement(keyfacts=list(reversed(_alignment([0], []).keyfacts)))

    async def answer(*_args: object) -> tuple[AlignmentJudgement, UsageMetadata]:
        return alignment, UsageMetadata()

    monkeypatch.setattr(fact_level_judges, "ask_judge", answer)

    judged, _usage = await align_keyfacts(
        ["Alpha rose.", "Beta fell."], ["Alpha rose."], JudgeModelRef("x", "y")
    )

    assert judged == alignment
