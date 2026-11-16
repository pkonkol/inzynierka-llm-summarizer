"""Pick the E3 evaluation subsets: 50 entries per set, none of them a calibration source."""

from __future__ import annotations

import argparse
import random
from collections import Counter, defaultdict
from pathlib import Path

import structlog

from app.core.config import settings
from app.schemas.calibration_api import CalibrationSample
from app.schemas.evaluation_set_api import EvaluationSetEntryImport, EvaluationSetImportRequest
from app.services.calibration_files import REPO_ROOT, read_sample

log = structlog.get_logger(__name__)

SUBSET_SIZE = 50
SEED = 20261107
PSC_CELLS = [(kind, percent) for kind in ("abstract", "extract") for percent in (5, 10, 20)]
PSC_ANNOTATORS = "abcdefghijk"
ENGLISH_SETS = {
    "cnn_dailymail": REPO_ROOT / "data" / "evaluation_set_cnn_dailymail.json",
    "curation": REPO_ROOT / "data" / "evaluation_set_curation.json",
    "gumsum": REPO_ROOT / "data" / "evaluation_set_gumsum.json",
}
PSC_SUBSET_FILE = REPO_ROOT / "data" / "psc" / "evaluation_set_e3_psc_50.json"


def calibration_texts(sample: CalibrationSample) -> set[str]:
    """Input texts of every calibration source, for exclusion."""
    return {source.input_text for source in sample.sources}


def sample_english_set(
    set_file: Path, excluded: set[str], rng: random.Random
) -> list[EvaluationSetEntryImport]:
    """50 entries without calibration texts; GUMSum stratified by genre."""
    evaluation_set = _read_set(set_file)
    candidates = [entry for entry in evaluation_set.entries if entry.input_text not in excluded]
    if evaluation_set.name != "gumsum":
        return rng.sample(candidates, SUBSET_SIZE)

    entries_by_genre: dict[str, list[EvaluationSetEntryImport]] = defaultdict(list)
    for entry in candidates:
        entries_by_genre[gumsum_genre(entry.url)].append(entry)
    return _take_round_robin(entries_by_genre, rng)


def gumsum_genre(url: str) -> str:
    """`gumsum:GUM_news_asylum` → `news`."""
    return url.removeprefix("gumsum:GUM_").split("_", 1)[0]


def _take_round_robin(
    groups: dict[str, list[EvaluationSetEntryImport]], rng: random.Random
) -> list[EvaluationSetEntryImport]:
    shuffled_groups = {
        name: rng.sample(entries, len(entries)) for name, entries in sorted(groups.items())
    }
    taken: list[EvaluationSetEntryImport] = []
    while len(taken) < SUBSET_SIZE:
        if not any(shuffled_groups.values()):
            raise ValueError(f"only {len(taken)} candidates, expected {SUBSET_SIZE}")
        for entries in shuffled_groups.values():
            if entries and len(taken) < SUBSET_SIZE:
                taken.append(entries.pop())
    return taken


def sample_psc(
    psc_sets_dir: Path, excluded: set[str], rng: random.Random
) -> list[EvaluationSetEntryImport]:
    """50 distinct texts spread over PSC_CELLS, annotators a-k taken in turn across all cells."""
    taken: list[EvaluationSetEntryImport] = []
    taken_texts: set[str] = set()
    annotator_turn = 0

    for (kind, percent), cell_size in zip(PSC_CELLS, psc_cell_sizes(), strict=True):
        for _ in range(cell_size):
            annotator = PSC_ANNOTATORS[annotator_turn % len(PSC_ANNOTATORS)]
            annotator_turn += 1
            annotator_file = psc_sets_dir / f"psc-{kind}-{annotator}-{percent}.json"
            candidates = [
                entry
                for entry in _read_set(annotator_file).entries
                if entry.input_text not in excluded and entry.input_text not in taken_texts
            ]
            if not candidates:
                raise ValueError(f"{annotator_file.name}: no unused non-calibration texts left")
            chosen = rng.choice(candidates)
            taken_texts.add(chosen.input_text)
            taken.append(
                chosen.model_copy(
                    update={"title": f"[{kind}-{percent}-{annotator}] {chosen.title}"}
                )
            )
    return taken


def psc_cell_sizes() -> list[int]:
    """9, 9, 8, 8, 8, 8: the remainder of 50 / 6 goes to the first cells."""
    base, remainder = divmod(SUBSET_SIZE, len(PSC_CELLS))
    return [base + 1 if index < remainder else base for index in range(len(PSC_CELLS))]


def psc_cell(title: str) -> str:
    """`[abstract-10-c] Tytuł` → `abstract-10`."""
    variant = title.removeprefix("[").split("]", 1)[0]
    kind, percent, _annotator = variant.split("-")
    return f"{kind}-{percent}"


def _read_set(path: Path) -> EvaluationSetImportRequest:
    return EvaluationSetImportRequest.model_validate_json(path.read_text("utf-8"))


def _assert_clean(name: str, entries: list[EvaluationSetEntryImport], excluded: set[str]) -> None:
    texts = [entry.input_text for entry in entries]
    if len(entries) != SUBSET_SIZE:
        raise ValueError(f"{name}: expected {SUBSET_SIZE} entries, got {len(entries)}")
    if len(set(texts)) != len(texts):
        raise ValueError(f"{name}: {len(texts) - len(set(texts))} duplicate texts")
    leaked = excluded.intersection(texts)
    if leaked:
        raise ValueError(f"{name}: {len(leaked)} calibration texts in the subset")


def _set_rng(set_name: str) -> random.Random:
    """Own stream per set, so regenerating one set leaves the others unchanged."""
    return random.Random(f"{SEED}-{set_name}")


def _subset_file(set_name: str) -> Path:
    return REPO_ROOT / "data" / f"evaluation_set_e3_{set_name}_50.json"


def _write_subset(
    path: Path, name: str, language: str, entries: list[EvaluationSetEntryImport]
) -> None:
    subset = EvaluationSetImportRequest(
        name=name, language=language, entries=entries, compute_golden_metrics=False
    )
    path.write_text(subset.model_dump_json(indent=2), encoding="utf-8")
    log.info("e3 subset written", path=str(path), entries=len(entries))


def _print_composition(name: str, entries: list[EvaluationSetEntryImport]) -> None:
    if name == "gumsum":
        groups = Counter(gumsum_genre(entry.url) for entry in entries)
    elif name == "psc":
        groups = Counter(psc_cell(entry.title) for entry in entries)
    else:
        groups = Counter({"all": len(entries)})
    print(name, dict(sorted(groups.items())))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--psc-sets-dir",
        type=Path,
        required=True,
        help="PSC_1.0/evaluation_sets with psc-<kind>-<letter>-<percent>.json",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="print the composition, write nothing"
    )
    args = parser.parse_args()

    if settings.calibration_data_dir is None:
        raise SystemExit("set CALIBRATION_DATA_DIR")
    excluded = calibration_texts(read_sample(settings.calibration_data_dir))
    subsets = {
        name: sample_english_set(path, excluded, _set_rng(name))
        for name, path in ENGLISH_SETS.items()
    }
    subsets["psc"] = sample_psc(args.psc_sets_dir, excluded, _set_rng("psc"))

    for name, entries in subsets.items():
        _assert_clean(name, entries, excluded)
        _print_composition(name, entries)
    if args.dry_run:
        return

    for name, entries in subsets.items():
        if name == "psc":
            _write_subset(PSC_SUBSET_FILE, "e3-psc-50", "pl", entries)
        else:
            _write_subset(_subset_file(name), f"e3-{name}-50", "en", entries)


if __name__ == "__main__":
    main()
