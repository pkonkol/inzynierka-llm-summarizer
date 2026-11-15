"""E3 subsets: 50 distinct texts per set, never a calibration source, every PSC cell and GUMSum genre present."""

import random
from collections import Counter
from pathlib import Path

from app.schemas.evaluation_set_api import EvaluationSetEntryImport, EvaluationSetImportRequest
from calibration.build_e3_subsets import (
    PSC_ANNOTATORS,
    PSC_CELLS,
    SUBSET_SIZE,
    gumsum_genre,
    psc_cell,
    psc_cell_sizes,
    sample_english_set,
    sample_psc,
)

GUMSUM_GENRES = ["academic", "bio", "fiction", "interview", "news", "whow"]


def _entry(text_id: str, url: str) -> EvaluationSetEntryImport:
    return EvaluationSetEntryImport(
        input_text=f"Text {text_id}.", golden_summary="Summary.", title=f"Title {text_id}", url=url
    )


def _write_set(path: Path, name: str, entries: list[EvaluationSetEntryImport]) -> Path:
    path.write_text(
        EvaluationSetImportRequest(name=name, entries=entries).model_dump_json(), "utf-8"
    )
    return path


def _gumsum_file(tmp_path: Path) -> Path:
    entries = [
        _entry(f"{genre}-{index}", f"gumsum:GUM_{genre}_doc{index}")
        for genre in GUMSUM_GENRES
        for index in range(15)
    ]
    return _write_set(tmp_path / "gumsum.json", "gumsum", entries)


def _psc_dir(tmp_path: Path) -> Path:
    """Every annotator file holds the same 80 texts, like the real corpus."""
    for kind, percent in PSC_CELLS:
        for annotator in PSC_ANNOTATORS:
            entries = [_entry(f"psc-{index}", f"psc://{index}") for index in range(80)]
            _write_set(
                tmp_path / f"psc-{kind}-{annotator}-{percent}.json",
                f"psc-{kind}-{annotator}-{percent}",
                entries,
            )
    return tmp_path


def test_no_subset_contains_a_calibration_text(tmp_path: Path) -> None:
    excluded = {f"Text {genre}-0." for genre in GUMSUM_GENRES} | {
        f"Text psc-{index}." for index in range(10)
    }

    english = sample_english_set(_gumsum_file(tmp_path), excluded, random.Random(1))
    psc = sample_psc(_psc_dir(tmp_path), excluded, random.Random(1))

    assert not excluded.intersection(entry.input_text for entry in english + psc)


def test_each_subset_has_fifty_distinct_texts(tmp_path: Path) -> None:
    english = sample_english_set(_gumsum_file(tmp_path), set(), random.Random(1))
    psc = sample_psc(_psc_dir(tmp_path), set(), random.Random(1))

    for entries in (english, psc):
        assert len({entry.input_text for entry in entries}) == SUBSET_SIZE


def test_psc_subset_covers_every_kind_and_length(tmp_path: Path) -> None:
    psc = sample_psc(_psc_dir(tmp_path), set(), random.Random(1))

    cells = Counter(psc_cell(entry.title) for entry in psc)

    assert list(cells.values()) == psc_cell_sizes()
    assert set(cells) == {f"{kind}-{percent}" for kind, percent in PSC_CELLS}


def test_gumsum_subset_covers_every_genre(tmp_path: Path) -> None:
    gumsum = sample_english_set(_gumsum_file(tmp_path), set(), random.Random(1))

    genres = Counter(gumsum_genre(entry.url) for entry in gumsum)

    assert set(genres) == set(GUMSUM_GENRES)
    assert max(genres.values()) - min(genres.values()) <= 1


def test_same_seed_gives_same_subsets(tmp_path: Path) -> None:
    gumsum_file, psc_dir = _gumsum_file(tmp_path), _psc_dir(tmp_path)

    first = sample_english_set(gumsum_file, set(), random.Random(7)) + sample_psc(
        psc_dir, set(), random.Random(7)
    )
    second = sample_english_set(gumsum_file, set(), random.Random(7)) + sample_psc(
        psc_dir, set(), random.Random(7)
    )

    assert first == second
