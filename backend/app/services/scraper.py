import asyncio
import logging

import trafilatura

logger = logging.getLogger(__name__)


async def extract_text_from_url(url: str) -> dict:
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
        data = await asyncio.to_thread(trafilatura.bare_extraction, downloaded, with_metadata=True)
        d = data.as_dict()
    except Exception as exc:
        logger.error("Scraper: Extraction exception for url=%s: %s", url, exc)
        raise ValueError("Failed to extract text from downloaded content") from exc

    if not d["text"] or not d["text"].strip():
        logger.warning("Scraper: Extraction returned empty text for url=%s", url)
        raise ValueError("Scraping returned empty content")

    return d
