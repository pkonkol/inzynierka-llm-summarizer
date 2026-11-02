import pytest
from rouge_score import rouge_scorer

from app.services.metrics import cross
from app.services.metrics.cross import combine_pairwise_orders, rouge_meteor_scores
from app.services.metrics.deepeval import DeepEvalMetricResult

_POLISH_REFERENCE = "Zażółć gęślą jaźń — Łódź i Kraków."


def test_polish_text_keeps_diacritic_words_whole() -> None:
    scores = rouge_meteor_scores(_POLISH_REFERENCE, "Łódź i Kraków.", language="pl")

    # 3 of 6 reference tokens match; the default tokenizer would have split "Łódź" into "d".
    assert scores["rouge1"] == round(2 * (3 / 3) * (3 / 6) / ((3 / 3) + (3 / 6)), 4)


def _meteor_without_wordnet(references: list[list[str]], hypothesis: list[str]) -> float:
    return 0.5  # WordNet is a download the test run does not have


def test_english_scores_match_stemmed_scorer(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cross, "meteor_score", _meteor_without_wordnet)
    reference = "The cats were running across the gardens."
    summary = "A cat runs across a garden."
    stemmed_scorer = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)
    expected = stemmed_scorer.score(reference, summary)

    scores = rouge_meteor_scores(reference, summary, language="en")

    assert scores["rouge1"] == round(expected["rouge1"].fmeasure, 4)
    assert scores["rouge2"] == round(expected["rouge2"].fmeasure, 4)
    assert scores["rougeL"] == round(expected["rougeL"].fmeasure, 4)
    assert scores["meteor"] == 0.5


def test_meteor_is_none_for_non_english() -> None:
    assert rouge_meteor_scores(_POLISH_REFERENCE, "Łódź.", language="pl")["meteor"] is None


def test_empty_tokenization_scores_zero() -> None:
    scores = rouge_meteor_scores(_POLISH_REFERENCE, "— …", language="pl")

    assert (scores["rouge1"], scores["rouge2"], scores["rougeL"]) == (0.0, 0.0, 0.0)


def _judged(score: float, reason: str) -> DeepEvalMetricResult:
    return DeepEvalMetricResult(
        name="pairwise_with_input",
        score=score,
        reason=reason,
        passed=score >= 0.5,
        judge_model="gemini:judge",
        rubric_version="abcd1234",
    )


def test_pairwise_score_averages_both_orders() -> None:
    combined = combine_pairwise_orders(_judged(0.9, "ai first"), _judged(0.3, "golden first"))

    assert combined["score"] == 0.8  # (0.9 + (1 - 0.3)) / 2
    assert (combined["score_ai_first"], combined["score_golden_first"]) == (0.9, 0.3)
    assert (combined["reason"], combined["reason_golden_first"]) == ("ai first", "golden first")


def test_pairwise_consistent_when_both_orders_pick_same_winner() -> None:
    assert combine_pairwise_orders(_judged(0.8, ""), _judged(0.2, ""))["consistent"] is True


def test_pairwise_inconsistent_when_orders_disagree() -> None:
    # Slot A wins both times: the judge followed position, not content.
    combined = combine_pairwise_orders(_judged(0.8, ""), _judged(0.8, ""))

    assert combined["consistent"] is False
    assert combined["score"] == 0.5
