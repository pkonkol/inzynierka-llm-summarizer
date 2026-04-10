import logging

import trafilatura

from ..core.config import settings


logger = logging.getLogger(__name__)


def extract_text_from_url(url: str) -> str:
    """Fetch a URL and return its extracted main text content."""
    logger.debug("Scraper: downloading url=%s", url)

    try:
        downloaded = trafilatura.fetch_url(url)
    except Exception as exc:  # pragma: no cover - defensive boundary for network layer
        raise ValueError(f"Failed to download URL: {url}") from exc

    if not downloaded:
        raise ValueError(f"Failed to download URL: {url}")

    logger.debug("Scraper: download ok bytes=%s", len(downloaded))

    try:
        text = trafilatura.extract(downloaded)
    except Exception as exc:  # pragma: no cover - defensive boundary for parser layer
        raise ValueError("Failed to extract text from downloaded content") from exc

    if not text or not text.strip():
        raise ValueError("Scraping returned empty content")

    logger.debug("Scraper: extraction ok text_chars=%s", len(text.strip()))

    return text.strip()
