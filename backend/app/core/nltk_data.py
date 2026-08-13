from __future__ import annotations

from pathlib import Path

import nltk
import structlog

log = structlog.get_logger(__name__)

_NLTK_DIR = Path(__file__).resolve().parents[2] / "nltk_data"
_WORDNET_RESOURCES = ("wordnet", "omw-1.4")


def ensure_wordnet_resources() -> None:
    _NLTK_DIR.mkdir(parents=True, exist_ok=True)
    data_dir = str(_NLTK_DIR)

    if data_dir not in nltk.data.path:
        nltk.data.path.insert(0, data_dir)

    for resource in _WORDNET_RESOURCES:
        try:
            nltk.data.find(f"corpora/{resource}")
            log.info("nltk resource already present", resource=resource)
            continue
        except LookupError:
            log.info("downloading nltk resource", resource=resource)

        nltk.download(resource, download_dir=data_dir, quiet=True, raise_on_error=True)
        log.info("downloaded nltk resource", resource=resource)
