from __future__ import annotations

import logging
from pathlib import Path

import nltk

logger = logging.getLogger(__name__)

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
            logger.info("NLTK resource already available: %s", resource)
            continue
        except LookupError:
            logger.info("Downloading NLTK resource: %s", resource)

        nltk.download(resource, download_dir=data_dir, quiet=True, raise_on_error=True)
        logger.info("Downloaded NLTK resource: %s", resource)
