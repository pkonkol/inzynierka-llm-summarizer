"""Step 1: pick the calibration sources, write AI summaries and key facts, split sentences, assign train/dev/test."""

from __future__ import annotations

import argparse
import asyncio
import itertools
import random
import secrets
from collections import Counter, defaultdict
from pathlib import Path

import structlog

from app.core.config import settings
from app.core.nltk_data import ensure_nltk_resources
from app.schemas.calibration_api import (
    CalibrationSample,
    CalibrationSource,
    CalibrationSplit,
    CalibrationSummary,
)
from app.schemas.evaluation_set_api import EvaluationSetImportRequest
from app.schemas.summary import LlmSummaryRequest
from app.schemas.summary_spec import (
    MatchReferenceLength,
    ProcessingStrategy,
    SummarySpec,
    resolve_target_length,
)
from app.services.calibration_files import REPO_ROOT, read_sample, write_sample
from app.services.llm import generate_summary
from app.services.metrics.fact_level_judges import JudgeModelRef, extract_keyfacts, split_sentences

log = structlog.get_logger(__name__)

SOURCES_PER_SET = {"cnn_dailymail": 4, "curation": 4, "gumsum": 4, "psc": 12}
SET_FILES = {
    "cnn_dailymail": REPO_ROOT / "data" / "evaluation_set_cnn_dailymail.json",
    "curation": REPO_ROOT / "data" / "evaluation_set_curation.json",
    "gumsum": REPO_ROOT / "data" / "evaluation_set_gumsum.json",
    "psc": REPO_ROOT / "data" / "psc" / "evaluation_set_psc.json",
}
SPLIT_SHARES: dict[CalibrationSplit, float] = {"train": 0.15, "dev": 0.45, "test": 0.40}
# Several families and one weak model, so the AI summaries carry natural errors for the labels.
AI_GENERATORS = [
    JudgeModelRef("openrouter", "deepseek/deepseek-v4.1-flash-1017"),
    JudgeModelRef("openrouter", "qwen/qwen3.8-flash"),
    JudgeModelRef("openrouter", "z-ai/glm-5.3-flash"),
    JudgeModelRef("openrouter", "openai/gpt-oss-120b"),
    JudgeModelRef("gemini", "gemma-4-31b-it"),
    JudgeModelRef("openrouter", "qwen/qwen3.5-9b"),
]
AI_STRATEGIES: list[ProcessingStrategy] = ["direct", "extract_then_synthesize"]
DEFAULT_KEYFACT_MODEL = "openrouter:deepseek/deepseek-v4-pro-0813"
_CONCURRENT_SOURCES = 4


def choose_sources(
    sets: dict[str, EvaluationSetImportRequest], counts: dict[str, int], seed: int
) -> list[CalibrationSource]:
    """`counts[set_name]` entries with a golden summary from each set, the same ones for the same seed."""
    rng = random.Random(seed)
    sources = []

    for set_name, count in counts.items():
        evaluation_set = sets[set_name]
        candidates = [
            (index, entry)
            for index, entry in enumerate(evaluation_set.entries)
            if entry.golden_summary
        ]
        if len(candidates) < count:
            raise ValueError(
                f"{set_name} has {len(candidates)} entries with a golden summary, need {count}"
            )

        for index, entry in rng.sample(candidates, count):
            sources.append(
                CalibrationSource(
                    source_id=f"{set_name}-{index:03d}",
                    set_name=set_name,
                    language=evaluation_set.language,
                    entry_id=str(index),
                    input_text=entry.input_text,
                    keyfacts=[],
                    keyfacts_approved=False,
                    split="train",  # placeholder until assign_splits
                )
            )
    return sources


def _split_counts(source_count: int) -> dict[CalibrationSplit, int]:
    """Largest-remainder rounding of SPLIT_SHARES, so the counts add up to source_count."""
    exact = {split: share * source_count for split, share in SPLIT_SHARES.items()}
    counts = {split: int(value) for split, value in exact.items()}
    by_remainder = sorted(exact, key=lambda split: exact[split] - counts[split], reverse=True)
    for split in by_remainder[: source_count - sum(counts.values())]:
        counts[split] += 1
    return counts


def assign_splits(sources: list[CalibrationSource], seed: int) -> list[CalibrationSource]:
    """Whole sources to train/dev/test at about 15/45/40 %, stratified by language."""
    rng = random.Random(seed)
    by_language: dict[str, list[CalibrationSource]] = defaultdict(list)
    for source in sources:
        by_language[source.language].append(source)

    assigned = []
    for language, language_sources in sorted(by_language.items()):
        if len(language_sources) < len(SPLIT_SHARES):
            raise ValueError(
                f"language {language} has {len(language_sources)} sources, every split needs one"
            )
        shuffled = rng.sample(language_sources, len(language_sources))
        start = 0
        for split, count in _split_counts(len(shuffled)).items():
            assigned += [
                source.model_copy(update={"split": split})
                for source in shuffled[start : start + count]
            ]
            start += count
    return assigned


async def _summarize_source(
    source: CalibrationSource,
    golden_summary: str,
    generator: JudgeModelRef,
    strategy: ProcessingStrategy,
    keyfact_model: JudgeModelRef,
) -> tuple[CalibrationSource, list[CalibrationSummary]]:
    spec = SummarySpec(length=MatchReferenceLength())
    request = LlmSummaryRequest(
        text=source.input_text,
        source_url=source.source_id,
        model_provider=generator.provider,
        model_name=generator.name,
        language=source.language,
        spec=spec,
        length=resolve_target_length(
            spec.length, input_words=len(source.input_text.split()), golden_summary=golden_summary
        ),
        related_sources=[],
    )
    ai_result, keyfacts = await asyncio.gather(
        generate_summary(request, strategy),
        extract_keyfacts(source.input_text, source.language, keyfact_model),
    )
    log.info("calibration source summarized", source_id=source.source_id, model=generator.name)

    summaries = [
        CalibrationSummary(
            summary_id=secrets.token_hex(4),
            source_id=source.source_id,
            origin=origin,
            generator_model=model,
            processing_strategy=processing_strategy,
            text=text,
            sentences=split_sentences(text, source.language),
        )
        for origin, model, processing_strategy, text in [
            ("golden", None, None, golden_summary),
            ("ai", generator.model_id(), strategy, ai_result.summary),
        ]
    ]
    return source.model_copy(update={"keyfacts": keyfacts}), summaries


def _load_sets() -> dict[str, EvaluationSetImportRequest]:
    return {
        set_name: EvaluationSetImportRequest.model_validate_json(path.read_text("utf-8"))
        for set_name, path in SET_FILES.items()
    }


def _print_plan(sources: list[CalibrationSource]) -> None:
    by_split = Counter((source.split, source.language) for source in sources)
    for source in sorted(sources, key=lambda source: (source.split, source.source_id)):
        print(f"{source.split:5}  {source.language}  {source.source_id}")
    print({f"{split}/{language}": count for (split, language), count in sorted(by_split.items())})


async def build(data_dir: Path, seed: int, keyfact_model: JudgeModelRef, dry_run: bool) -> None:
    if (data_dir / "sample.json").exists():
        raise SystemExit(
            f"{data_dir / 'sample.json'} exists and labels point at its ids; delete it to rebuild"
        )

    sets = _load_sets()
    sources = assign_splits(choose_sources(sets, SOURCES_PER_SET, seed), seed)
    _print_plan(sources)
    if dry_run:
        return

    rng = random.Random(seed)
    pairings = list(itertools.product(AI_GENERATORS, AI_STRATEGIES))
    generator_plan = [pairings[index % len(pairings)] for index in range(len(sources))]
    rng.shuffle(generator_plan)
    limit = asyncio.Semaphore(_CONCURRENT_SOURCES)

    async def one(
        source: CalibrationSource, generator: JudgeModelRef, strategy: ProcessingStrategy
    ) -> tuple[CalibrationSource, list[CalibrationSummary]]:
        golden_summary = sets[source.set_name].entries[int(source.entry_id)].golden_summary
        if golden_summary is None:
            raise ValueError(f"{source.source_id} lost its golden summary since choose_sources")
        async with limit:
            return await _summarize_source(
                source, golden_summary, generator, strategy, keyfact_model
            )

    results = await asyncio.gather(
        *(
            one(source, generator, strategy)
            for source, (generator, strategy) in zip(sources, generator_plan, strict=True)
        )
    )
    sample = CalibrationSample(
        sources=[source for source, _summaries in results],
        summaries=[summary for _source, summaries in results for summary in summaries],
    )
    write_sample(data_dir, sample)
    print(f"wrote {len(read_sample(data_dir).summaries)} summaries to {data_dir / 'sample.json'}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--keyfact-model", default=DEFAULT_KEYFACT_MODEL, help="provider:model")
    parser.add_argument(
        "--dry-run", action="store_true", help="print the chosen sources and splits, call no model"
    )
    args = parser.parse_args()

    if settings.calibration_data_dir is None:
        raise SystemExit("set CALIBRATION_DATA_DIR")
    provider, name = args.keyfact_model.split(":", 1)
    ensure_nltk_resources()
    asyncio.run(
        build(settings.calibration_data_dir, args.seed, JudgeModelRef(provider, name), args.dry_run)
    )


if __name__ == "__main__":
    main()
