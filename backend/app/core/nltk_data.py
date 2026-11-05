from __future__ import annotations

from contextlib import suppress
from pathlib import Path

import nltk
import structlog

log = structlog.get_logger(__name__)

_NLTK_DIR = Path(__file__).resolve().parents[2] / "nltk_data"
# resource -> nltk data category. METEOR calls wordnet.synsets() with the default lang="eng",
# which returns before it would ever reach the Open Multilingual Wordnet. punkt_tab holds the
# English and Polish sentence-boundary tables behind split_sentences().
_RESOURCES = {"wordnet": "corpora", "punkt_tab": "tokenizers"}


def _is_resource_present(resource: str, category: str) -> bool:
    # The zipped and unpacked layouts answer to different paths, and nltk's own fallback
    # builds the archive path without the trailing slash that a zip directory entry needs.
    for probe in (f"{category}/{resource}.zip/{resource}/", f"{category}/{resource}"):
        with suppress(LookupError):
            nltk.data.find(probe)
            return True
    return False


def ensure_nltk_resources() -> None:
    _NLTK_DIR.mkdir(parents=True, exist_ok=True)
    data_dir = str(_NLTK_DIR)

    if data_dir not in nltk.data.path:
        nltk.data.path.insert(0, data_dir)

    for resource, category in _RESOURCES.items():
        if _is_resource_present(resource, category):
            log.info("nltk resource already present", resource=resource)
            continue

        log.info("downloading nltk resource", resource=resource)
        nltk.download(resource, download_dir=data_dir, quiet=True, raise_on_error=True)
        log.info("downloaded nltk resource", resource=resource)
