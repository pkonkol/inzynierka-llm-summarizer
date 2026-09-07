from __future__ import annotations

from contextlib import suppress
from pathlib import Path

import nltk
import structlog

log = structlog.get_logger(__name__)

_NLTK_DIR = Path(__file__).resolve().parents[2] / "nltk_data"
# METEOR is the only consumer, and it calls wordnet.synsets() with the default lang="eng",
# which returns before it would ever reach the Open Multilingual Wordnet.
_WORDNET_RESOURCE = "wordnet"


def _is_resource_present(resource: str) -> bool:
    # The zipped and unpacked layouts answer to different paths, and nltk's own fallback
    # builds the archive path without the trailing slash that a zip directory entry needs.
    for probe in (f"corpora/{resource}.zip/{resource}/", f"corpora/{resource}"):
        with suppress(LookupError):
            nltk.data.find(probe)
            return True
    return False


def ensure_wordnet_resources() -> None:
    _NLTK_DIR.mkdir(parents=True, exist_ok=True)
    data_dir = str(_NLTK_DIR)

    if data_dir not in nltk.data.path:
        nltk.data.path.insert(0, data_dir)

    if _is_resource_present(_WORDNET_RESOURCE):
        log.info("nltk resource already present", resource=_WORDNET_RESOURCE)
        return

    log.info("downloading nltk resource", resource=_WORDNET_RESOURCE)
    nltk.download(_WORDNET_RESOURCE, download_dir=data_dir, quiet=True, raise_on_error=True)
    log.info("downloaded nltk resource", resource=_WORDNET_RESOURCE)
