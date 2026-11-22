"""Step 6: compare every candidate's verdicts with the author's labels and write report.md."""

from __future__ import annotations

import argparse
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings
from app.schemas.calibration_api import CalibrationLabels, CalibrationSample, CalibrationSplit
from app.schemas.usage import UsageMetadata
from app.services.calibration_files import (
    CandidatePredictions,
    JudgedItem,
    Negative,
    all_predictions,
    negatives_collected,
    read_labels,
    read_negatives,
    read_sample,
)

DEGREE_ORDER = ["one_sentence", "two_sentences", "half", "whole"]
SUBSETS = ["all", "golden", "ai", "negative", "same family", "other family"]


@dataclass(frozen=True, slots=True)
class JudgeAgreement:
    # Of the atoms the author marked good, the share the judge also marked good; None with no such atom.
    true_positive_rate: float | None
    # Of the atoms the author marked bad, the share the judge also caught; None with no such atom.
    true_negative_rate: float | None
    positives: int
    negatives: int


@dataclass(frozen=True, slots=True)
class DegreePoint:
    degree: str
    mean_score: float
    negatives: int


def true_positive_and_negative_rates(
    labels: list[bool | None], predictions: list[bool]
) -> JudgeAgreement:
    """Atoms the author marked unclear (None) are left out."""
    if len(labels) != len(predictions):
        raise ValueError(f"{len(labels)} labels against {len(predictions)} predictions")

    judged = [
        (label, prediction)
        for label, prediction in zip(labels, predictions, strict=True)
        if label is not None
    ]
    positives = [prediction for label, prediction in judged if label]
    negatives = [not prediction for label, prediction in judged if not label]
    return JudgeAgreement(
        true_positive_rate=sum(positives) / len(positives) if positives else None,
        true_negative_rate=sum(negatives) / len(negatives) if negatives else None,
        positives=len(positives),
        negatives=len(negatives),
    )


def degree_curve(
    scores_by_negative_id: dict[str, float], negatives: list[Negative]
) -> list[DegreePoint]:
    """Mean judge score per degree of corruption, lightest first; it should fall as the degree grows."""
    scores_by_degree: dict[str, list[float]] = defaultdict(list)
    for negative in negatives:
        scores_by_degree[negative.degree].append(scores_by_negative_id[negative.negative_id])

    return [
        DegreePoint(degree=degree, mean_score=sum(scores) / len(scores), negatives=len(scores))
        for degree in DEGREE_ORDER
        if (scores := scores_by_degree.get(degree))
    ]


@dataclass(frozen=True, slots=True)
class _Atom:
    metric: str
    label: bool | None
    prediction: bool
    subsets: tuple[str, ...]


def model_family(model_id: str) -> str:
    """`openrouter:deepseek/…` → deepseek; Gemini API models are Google's."""
    provider, name = model_id.split(":", 1)
    if provider == "gemini":
        return "google"
    return name.split("/")[0] if "/" in name else provider


@dataclass(frozen=True, slots=True)
class _Truth:
    """The author's verdicts on one item, or the expectations of one negative."""

    origin: str
    family: str
    sentence_faithful: list[bool | None]
    sentence_carries_keyfact: list[bool | None]
    keyfact_present: list[bool | None]
    coherent: bool | None
    has_repetition: bool | None


def _truths(
    sample: CalibrationSample, labels: CalibrationLabels, negatives: list[Negative]
) -> dict[str, _Truth]:
    summaries = {summary.summary_id: summary for summary in sample.summaries}

    def summary_family(summary_id: str) -> str:
        generator = summaries[summary_id].generator_model
        return "human" if generator is None else model_family(generator)

    truths = {
        summary_id: _Truth(
            origin=summaries[summary_id].origin,
            family=summary_family(summary_id),
            sentence_faithful=[sentence.faithful for sentence in label.sentences],
            sentence_carries_keyfact=[sentence.carries_keyfact for sentence in label.sentences],
            keyfact_present=label.keyfacts_present,
            coherent=label.coherent,
            has_repetition=None,
        )
        for summary_id, label in labels.summaries.items()
    }
    for negative in negatives:
        truths[negative.negative_id] = _Truth(
            origin="negative",
            family=summary_family(negative.base_summary_id)
            if negative.generator_model == "none"
            else model_family(negative.generator_model),
            sentence_faithful=negative.expected.sentence_faithful,
            sentence_carries_keyfact=negative.expected.sentence_carries_keyfact,
            keyfact_present=negative.expected.keyfact_present,
            coherent=negative.expected.coherent,
            has_repetition=negative.expected.has_repetition,
        )
    return truths


def _item_atoms(truth: _Truth, item: JudgedItem, judge_family: str) -> list[_Atom]:
    subsets = (
        "all",
        truth.origin,
        "same family" if truth.family == judge_family else "other family",
    )
    pairs: list[tuple[str, bool | None, bool | None]] = []
    no_repetition = None if truth.has_repetition is None else not truth.has_repetition

    if item.fact_level and item.coherence:
        carried = {
            index
            for match in item.fact_level.alignment.keyfacts
            for index in match.sentence_indices
        }
        verdicts = {
            verdict.sentence_index: verdict.faithful
            for verdict in item.fact_level.faithfulness.sentences
        }
        present = {
            match.keyfact_index: match.present for match in item.fact_level.alignment.keyfacts
        }
        pairs += [
            ("faithfulness", label, verdicts[index])
            for index, label in enumerate(truth.sentence_faithful)
        ]
        pairs += [
            ("carries key fact", label, index in carried)
            for index, label in enumerate(truth.sentence_carries_keyfact)
        ]
        pairs += [
            ("key fact present", label, present[index])
            for index, label in enumerate(truth.keyfact_present)
        ]
        pairs.append(("coherence", truth.coherent, item.coherence.judgement.coherent))
        pairs.append(("no repetition", no_repetition, not item.fact_level.scores.has_repetition))
    else:
        # An unusable answer is a judge mistake on every atom it should have decided.
        pairs += [("faithfulness", label, None) for label in truth.sentence_faithful]
        pairs += [("carries key fact", label, None) for label in truth.sentence_carries_keyfact]
        pairs += [("key fact present", label, None) for label in truth.keyfact_present]
        pairs.append(("coherence", truth.coherent, None))
        pairs.append(("no repetition", no_repetition, None))

    return [
        _Atom(metric, label, (not label) if prediction is None else prediction, subsets)
        for metric, label, prediction in pairs
        if label is not None
    ]


def _rate(value: float | None) -> str:
    return "—" if value is None else f"{value:.0%}"


def _agreement_table(atoms: list[_Atom]) -> list[str]:
    lines = ["| metric | subset | TPR | TNR | n good | n bad |", "|---|---|---:|---:|---:|---:|"]
    for metric in sorted({atom.metric for atom in atoms}):
        for subset in SUBSETS:
            chosen = [atom for atom in atoms if atom.metric == metric and subset in atom.subsets]
            if not chosen:
                continue
            agreement = true_positive_and_negative_rates(
                [atom.label for atom in chosen], [atom.prediction for atom in chosen]
            )
            lines.append(
                f"| {metric} | {subset} | {_rate(agreement.true_positive_rate)} | "
                f"{_rate(agreement.true_negative_rate)} | {agreement.positives} | {agreement.negatives} |"
            )
    return lines


def _candidate_section(
    candidate: CandidatePredictions,
    split: CalibrationSplit,
    sample: CalibrationSample,
    labels: CalibrationLabels,
    negatives: list[Negative],
) -> list[str]:
    truths = _truths(sample, labels, negatives)
    judge_family = model_family(candidate.judge_model)
    items = [
        item for item in candidate.items.values() if item.split == split and item.item_id in truths
    ]
    atoms = [
        atom for item in items for atom in _item_atoms(truths[item.item_id], item, judge_family)
    ]

    origin_by_summary = {summary.summary_id: summary.origin for summary in sample.summaries}
    split_by_source = {source.source_id: source.split for source in sample.sources}
    pair_labels = [
        (origin_by_summary[verdict.better_summary_id] == "ai", candidate.pairs[source_id])
        for source_id, verdict in labels.pairs.items()
        if source_id in candidate.pairs and split_by_source[source_id] == split
    ]
    atoms += [
        _Atom(
            "pair: prefers AI",
            author_prefers_ai,
            prediction.preferred == "ai"
            if prediction.preferred != "tie"
            else not author_prefers_ai,
            ("all",),
        )
        for author_prefers_ai, prediction in pair_labels
    ]

    usage = sum(
        (part.usage for item in items for part in (item.fact_level, item.coherence) if part),
        UsageMetadata(),
    )
    errors = sum(1 for item in items if item.error)
    lines = [
        f"## {candidate.judge_model} · prompts {candidate.prompt_version} · {split}",
        "",
        f"{len(items)} items, {errors} unusable answers; tokens in {usage.input_tokens}, out {usage.output_tokens} "
        f"(thinking {usage.thinking_tokens}); pairs judged {len(pair_labels)}, "
        f"consistent across orders {sum(prediction.consistent for _label, prediction in pair_labels)}.",
        "",
        *_agreement_table(atoms),
        "",
    ]

    judged_negatives = [
        negative
        for negative in negatives
        if (item := candidate.items.get(negative.negative_id))
        and item.fact_level
        and item.split == split
    ]
    if judged_negatives:
        lines += [
            "| kind | degree | faithfulness | completeness | conciseness | n |",
            "|---|---|---:|---:|---:|---:|",
        ]
        for kind in sorted({negative.kind for negative in judged_negatives}):
            lines += _degree_rows(kind, [n for n in judged_negatives if n.kind == kind], candidate)
        lines.append("")
    return lines


def _degree_rows(
    kind: str, negatives: list[Negative], candidate: CandidatePredictions
) -> list[str]:
    curves = {
        score: degree_curve(
            {
                negative.negative_id: getattr(
                    candidate.items[negative.negative_id].fact_level.scores, score
                )
                for negative in negatives
            },
            negatives,
        )
        for score in ("faithfulness", "completeness", "conciseness")
    }
    return [
        f"| {kind} | {point.degree} | {point.mean_score:.2f} | {curves['completeness'][at].mean_score:.2f} | "
        f"{curves['conciseness'][at].mean_score:.2f} | {point.negatives} |"
        for at, point in enumerate(curves["faithfulness"])
    ]


def write_report(data_dir: Path, split: CalibrationSplit) -> Path:
    sample = read_sample(data_dir)
    labels = read_labels()
    negatives = read_negatives(data_dir) if negatives_collected(data_dir) else []
    lines = [
        f"# Judge calibration · split {split}",
        "",
        "TPR: of the atoms the author marked good, the share the judge also marked good. "
        "TNR: of the atoms the author marked bad, the share the judge caught. Unclear atoms are left out; "
        "an unusable judge answer counts as wrong. Threshold: both ≥ 90 %.",
        "",
    ]
    for candidate in all_predictions(data_dir):
        lines += _candidate_section(candidate, split, sample, labels, negatives)

    path = data_dir / f"report_{split}.md"
    path.write_text("\n".join(lines), "utf-8")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split", required=True, choices=["train", "dev", "test"])
    args = parser.parse_args()
    if settings.calibration_data_dir is None:
        raise SystemExit("set CALIBRATION_DATA_DIR")
    print(f"report: {write_report(settings.calibration_data_dir, args.split)}")


if __name__ == "__main__":
    main()
