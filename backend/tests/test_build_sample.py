"""Cases cs16-cs19: whole sources to train/dev/test, stratified by language."""

from collections import Counter

import pytest

from app.schemas.calibration_api import CalibrationSource
from calibration.build_sample import assign_splits

SPLIT_SHARES = {"train": 0.15, "dev": 0.45, "test": 0.40}


def _sources(languages: dict[str, int]) -> list[CalibrationSource]:
    return [
        CalibrationSource(
            source_id=f"{language}-{index}",
            set_name="psc" if language == "pl" else "cnn_dailymail",
            language=language,
            entry_id=f"entry-{language}-{index}",
            input_text="Source text.",
            keyfacts=[],
            keyfacts_approved=False,
            split="train",
        )
        for language, count in languages.items()
        for index in range(count)
    ]


def test_case_16_every_source_lands_in_exactly_one_split() -> None:
    sources = _sources({"pl": 12, "en": 12})

    assigned = assign_splits(sources, seed=1)

    assert sorted(source.source_id for source in assigned) == sorted(
        source.source_id for source in sources
    )


def test_case_17_every_language_in_every_split_near_target_shares() -> None:
    assigned = assign_splits(_sources({"pl": 12, "en": 12}), seed=1)

    split_counts = Counter(source.split for source in assigned)
    for split, share in SPLIT_SHARES.items():
        assert abs(split_counts[split] - share * len(assigned)) <= 1, split
    for language in ("pl", "en"):
        language_splits = {source.split for source in assigned if source.language == language}
        assert language_splits == set(SPLIT_SHARES), language


def test_case_18_seed_makes_the_split_reproducible() -> None:
    sources = _sources({"pl": 12, "en": 12})

    def split_of(seed: int) -> dict[str, str]:
        return {source.source_id: source.split for source in assign_splits(sources, seed=seed)}

    assert split_of(1) == split_of(1)
    assert split_of(1) != split_of(2)


def test_case_19_language_with_fewer_than_three_sources_is_rejected() -> None:
    with pytest.raises(ValueError):
        assign_splits(_sources({"pl": 12, "en": 2}), seed=1)
