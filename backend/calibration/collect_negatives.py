"""Step 4: turn the changes the author staged in review/ into negatives.json; unstaged ones count as rejected."""

from __future__ import annotations

import subprocess
from collections import Counter
from pathlib import Path

from app.core.config import settings
from app.services.calibration_files import (
    Negative,
    read_negative_candidates,
    review_dir,
    write_negatives,
)


def _git_show(repository: Path, revision_path: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repository), "show", revision_path],
        check=True,
        capture_output=True,
        text=True,
    ).stdout


def is_accepted(repository: Path, negative: Negative) -> bool:
    """Staged whole means accepted, not staged means rejected; anything in between is ambiguous."""
    file_name = f"{negative.negative_id}.txt"
    committed = _git_show(repository, f"HEAD:{file_name}")
    staged = _git_show(repository, f":{file_name}")
    proposed = (repository / file_name).read_text("utf-8")

    if staged == committed:
        return False
    if staged == proposed:
        return True
    raise SystemExit(f"{file_name} is staged only in part; stage all of it or none of it")


def collect(data_dir: Path) -> None:
    repository = review_dir(data_dir)
    candidates = read_negative_candidates(data_dir)
    accepted = [negative for negative in candidates if is_accepted(repository, negative)]
    write_negatives(data_dir, accepted)

    proposed_by_kind = Counter(negative.kind for negative in candidates)
    accepted_by_kind = Counter(negative.kind for negative in accepted)
    for kind, proposed in sorted(proposed_by_kind.items()):
        rejected = proposed - accepted_by_kind[kind]
        print(f"{kind:18} accepted {accepted_by_kind[kind]:3} / {proposed:3}  rejected {rejected / proposed:.0%}")
    print(f"wrote {len(accepted)} negatives to {data_dir / 'negatives.json'}")


def main() -> None:
    if settings.calibration_data_dir is None:
        raise SystemExit("set CALIBRATION_DATA_DIR")
    collect(settings.calibration_data_dir)


if __name__ == "__main__":
    main()
