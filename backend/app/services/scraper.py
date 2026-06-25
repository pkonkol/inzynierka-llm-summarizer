import logging
import asyncio

import trafilatura

from ..core.config import settings


logger = logging.getLogger(__name__)


# def extract_text_from_url(url: str) -> str:
#     """Fetch a URL and return its extracted main text content."""
#     logger.debug("Scraper: downloading url=%s", url)

#     try:
#         downloaded = trafilatura.fetch_url(url)
#     except Exception as exc:  # pragma: no cover - defensive boundary for network layer
#         raise ValueError(f"Failed to download URL: {url}") from exc

#     if not downloaded:
#         raise ValueError(f"Failed to download URL: {url}")

#     logger.debug("Scraper: download ok bytes=%s", len(downloaded))

#     try:
#         text =  trafilatura.extract(downloaded)
#     except Exception as exc:  # pragma: no cover - defensive boundary for parser layer
#         raise ValueError("Failed to extract text from downloaded content") from exc

#     if not text or not text.strip():
#         raise ValueError("Scraping returned empty content")

#     logger.debug("Scraper: extraction ok text_chars=%s", len(text.strip()))

#     return text.strip()

async def extract_text_from_url(url: str) -> str:
    """
    Fetch a URL and return its extracted main text content asynchronously.
    Offloads synchronous networking and CPU-bound parsing to a background thread
    to prevent blocking the main asyncio event loop.
    """
    logger.debug("Scraper: downloading url=%s", url)

    try:
        # Offload the blocking network request to a thread
        downloaded = await asyncio.to_thread(trafilatura.fetch_url, url)
    except Exception as exc:
        logger.error("Scraper: Network exception for url=%s: %s", url, exc)
        raise ValueError(f"Failed to download URL: {url}") from exc

    if not downloaded:
        logger.warning("Scraper: Empty download response for url=%s", url)
        raise ValueError(f"Failed to download URL: {url}")

    logger.debug("Scraper: download ok bytes=%s", len(downloaded))

    try:
        # Offload the blocking CPU-intensive parsing to a thread
        text = await asyncio.to_thread(trafilatura.extract, downloaded)
    except Exception as exc:
        logger.error("Scraper: Extraction exception for url=%s: %s", url, exc)
        raise ValueError("Failed to extract text from downloaded content") from exc

    if not text or not text.strip():
        logger.warning("Scraper: Extraction returned empty text for url=%s", url)
        raise ValueError("Scraping returned empty content")

    extracted_text = text.strip()
    logger.debug("Scraper: extraction ok text_chars=%s", len(extracted_text))

    return extracted_text