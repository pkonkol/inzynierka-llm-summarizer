"""Step 5: run judge candidates with the current prompts over a split and store their verdicts in predictions/.

Re-running skips what is already stored, so an interrupted run resumes where it stopped.
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

import structlog

from app.core.config import settings
from app.core.nltk_data import ensure_nltk_resources
from app.schemas.calibration_api import (
    CalibrationLabels,
    CalibrationSample,
    CalibrationSource,
    CalibrationSplit,
    CalibrationSummary,
)
from app.schemas.judges import CoherenceResult, FactLevelResult
from app.services.calibration_files import (
    CandidatePredictions,
    JudgedItem,
    PairPrediction,
    SummarizationReference,
    negatives_collected,
    predictions_path,
    read_labels,
    read_negatives,
    read_predictions,
    read_sample,
    write_predictions,
)
from app.services.llm import LlmOutputError
from app.services.metrics.coherence import COHERENCE_PROMPT_VERSION, judge_coherence
from app.services.metrics.cross import PAIRWISE_WITH_INPUT, evaluate_pairwise_cross_deepeval
from app.services.metrics.deepeval import evaluate_summarization_metric
from app.services.metrics.fact_level_judges import (
    FACT_LEVEL_PROMPT_VERSION,
    JudgeModelRef,
    judge_fact_level_sentences,
)

log = structlog.get_logger(__name__)

PROMPT_VERSION = f"{FACT_LEVEL_PROMPT_VERSION}+{COHERENCE_PROMPT_VERSION}"
_CONCURRENT_ITEMS = 4

JUDGE_CANDIDATES: list[JudgeModelRef] = [
    JudgeModelRef("ollama", "mimo-v2.6:9b"),
    # floor: expected to miss the threshold
    JudgeModelRef("openrouter", "inclusionai/ling-3.0-tiny"),
    JudgeModelRef("openrouter", "qwen/qwen3.5-9b"),
    JudgeModelRef("openrouter", "deepseek/deepseek-v4.1-flash-1017"),
    JudgeModelRef("openrouter", "z-ai/glm-5.3-flash"),
    JudgeModelRef("openrouter", "xiaomi/mimo-v2.6-flash"),
    JudgeModelRef("openrouter", "anthropic/claude-haiku-5.5"),
    JudgeModelRef("openrouter", "openai/gpt-6-luna"),
    JudgeModelRef("openrouter", "meta/muse-ember"),
    JudgeModelRef("openrouter", "qwen/qwen3.8-flash"),
    JudgeModelRef("openrouter", "openai/gpt-oss-120b"),
    JudgeModelRef("openrouter", "z-ai/glm-5.3"),
    # ceiling: the model the prompts were tuned on
    JudgeModelRef("openrouter", "deepseek/deepseek-v4-pro-0813"),
    JudgeModelRef("openrouter", "google/gemini-4-hydrogen"),
]


async def _judge_sentences(
    source_text: str, sentences: list[str], keyfacts: list[str], judge: JudgeModelRef
) -> tuple[FactLevelResult, CoherenceResult]:
    """The labelled sentences go to the judges as they are, so their indices match the labels."""
    return await asyncio.gather(
        judge_fact_level_sentences(source_text, sentences, keyfacts, judge),
        judge_coherence(" ".join(sentences), judge),
    )


def _keyfacts(sample: CalibrationSample, labels: CalibrationLabels, source_id: str) -> list[str]:
    if source_id in labels.keyfacts:
        return labels.keyfacts[source_id].keyfacts
    return next(source.keyfacts for source in sample.sources if source.source_id == source_id)


async def run_candidate(
    data_dir: Path,
    judge: JudgeModelRef,
    split: CalibrationSplit,
    limit: int | None,
    with_reference: bool,
) -> Path:
    sample = read_sample(data_dir)
    labels = read_labels()
    negatives = (
        read_negatives(data_dir) if negatives_collected(data_dir) else []
    )  # dev tuning may start before the negatives
    sources = {source.source_id: source for source in sample.sources if source.split == split}
    summaries = {
        summary.summary_id: summary for summary in sample.summaries if summary.source_id in sources
    }

    path = predictions_path(data_dir, judge.model_id(), PROMPT_VERSION)
    predictions: CandidatePredictions = read_predictions(path, judge.model_id(), PROMPT_VERSION)
    work = [
        (summary.summary_id, summary.source_id, summary.origin, summary.sentences)
        for summary in summaries.values()
    ] + [
        (
            negative.negative_id,
            summaries[negative.base_summary_id].source_id,
            "negative",
            negative.sentences,
        )
        for negative in negatives
        if negative.base_summary_id in summaries
    ]
    work = [item for item in work if item[0] not in predictions.items][:limit]
    limiter = asyncio.Semaphore(_CONCURRENT_ITEMS)
    log.info("judging calibration items", model=judge.name, split=split, items=len(work))

    async def one(item_id: str, source_id: str, origin: str, sentences: list[str]) -> None:
        async with limiter:
            try:
                fact_level, coherence = await _judge_sentences(
                    sources[source_id].input_text,
                    sentences,
                    _keyfacts(sample, labels, source_id),
                    judge,
                )
                judged = JudgedItem(
                    item_id=item_id,
                    split=split,
                    origin=origin,
                    fact_level=fact_level,
                    coherence=coherence,
                    error=None,
                )
            except (LlmOutputError, ValueError) as error:
                log.warning(
                    "judge answer unusable", item_id=item_id, model=judge.name, error=str(error)
                )
                judged = JudgedItem(
                    item_id=item_id,
                    split=split,
                    origin=origin,
                    fact_level=None,
                    coherence=None,
                    error=str(error),
                )
        predictions.items[item_id] = judged
        write_predictions(path, predictions)

    await asyncio.gather(*(one(*item) for item in work))
    await _judge_pairs(sample, sources, predictions, path, limit)
    if with_reference:
        await _summarization_reference(sources, summaries, predictions, path, limit)
    return path


async def _judge_pairs(
    sample: CalibrationSample,
    sources: dict[str, CalibrationSource],
    predictions: CandidatePredictions,
    path: Path,
    limit: int | None,
) -> None:
    pending = [source_id for source_id in sources if source_id not in predictions.pairs][:limit]
    for source_id in pending:
        by_origin = {
            summary.origin: summary.text
            for summary in sample.summaries
            if summary.source_id == source_id
        }
        (with_input,) = await evaluate_pairwise_cross_deepeval(
            settings,
            sources[source_id].input_text,
            by_origin["ai"],
            by_origin["golden"],
            specs=[PAIRWISE_WITH_INPUT],
        )
        score = with_input["score"]
        predictions.pairs[source_id] = PairPrediction(
            source_id=source_id,
            preferred="ai" if score > 0.5 else "golden" if score < 0.5 else "tie",
            score=score,
            consistent=with_input["consistent"],
        )
        write_predictions(path, predictions)


async def _summarization_reference(
    sources: dict[str, CalibrationSource],
    summaries: dict[str, CalibrationSummary],
    predictions: CandidatePredictions,
    path: Path,
    limit: int | None,
) -> None:
    pending = [
        summary
        for summary_id, summary in summaries.items()
        if summary_id not in predictions.summarization_metric
    ][:limit]
    for summary in pending:
        result = await evaluate_summarization_metric(
            settings, sources[summary.source_id].input_text, summary.text
        )
        predictions.summarization_metric[summary.summary_id] = SummarizationReference(
            summary_id=summary.summary_id, score=result.score, passed=result.passed
        )
        write_predictions(path, predictions)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    which_judges = parser.add_mutually_exclusive_group(required=True)
    which_judges.add_argument(
        "--model",
        help="provider:model, e.g. openrouter:deepseek/deepseek-v4-pro-0813",
    )
    which_judges.add_argument(
        "--all-candidates",
        action="store_true",
        help="run every JUDGE_CANDIDATES entry, one after another",
    )
    parser.add_argument("--split", required=True, choices=["train", "dev", "test"])
    parser.add_argument(
        "--limit", type=int, default=None, help="judge at most N more items and pairs"
    )
    parser.add_argument(
        "--summarization-metric",
        action="store_true",
        help="also run deepeval's SummarizationMetric",
    )
    args = parser.parse_args()

    if settings.calibration_data_dir is None:
        raise SystemExit("set CALIBRATION_DATA_DIR")
    if args.all_candidates:
        judges = JUDGE_CANDIDATES
    else:
        provider, name = args.model.split(":", 1)
        judges = [JudgeModelRef(provider, name)]
    ensure_nltk_resources()
    for judge in judges:  # one at a time, so a local Ollama judge does not share the GPU
        # Pairwise and SummarizationMetric run through deepeval, whose judge comes from settings.
        settings.deepeval_judge_model = {"model_provider": judge.provider, "model_name": judge.name}
        path = asyncio.run(
            run_candidate(
                settings.calibration_data_dir,
                judge,
                args.split,
                args.limit,
                args.summarization_metric,
            )
        )
        print(f"predictions: {path}")


if __name__ == "__main__":
    main()
