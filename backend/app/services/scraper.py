import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit

import httpx
import structlog
import trafilatura

log = structlog.get_logger(__name__)

# Enough for an article, small enough that a hostile server cannot stream us out of memory.
_MAX_BYTES = 10 * 1024 * 1024
_MAX_REDIRECTS = 5
_TIMEOUT = httpx.Timeout(15.0, connect=5.0)


class UnsafeUrlError(ValueError):
    """The URL is syntactically fine but points somewhere we refuse to fetch."""


def _assert_fetchable(url: str) -> None:
    """Raise unless `url` is http(s) and every address it resolves to is public.

    Checking resolved addresses rather than the text of the URL is the point: an attacker
    controls their own DNS, so `http://their.example` can answer with 10.0.0.5 while
    containing no suspicious string at all. `ipaddress` also classifies IPv4-mapped IPv6,
    6to4 and NAT64 correctly, which is where several published CVEs in other projects' URL
    validators went wrong. Full write-up: docs/security/0001-ssrf-scraper.md
    """
    parts = urlsplit(url)

    if parts.scheme not in ("http", "https"):
        raise UnsafeUrlError(f"Only http and https are allowed, got {parts.scheme!r}")

    host = parts.hostname
    if not host:
        raise UnsafeUrlError("URL has no host")

    try:
        resolved = socket.getaddrinfo(host, parts.port or (443 if parts.scheme == "https" else 80))
    except socket.gaierror as exc:
        raise UnsafeUrlError(f"Cannot resolve host {host!r}") from exc

    for *_, sockaddr in resolved:
        ip = ipaddress.ip_address(sockaddr[0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local  # 169.254.0.0/16 — cloud metadata lives here
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise UnsafeUrlError(f"Host {host!r} resolves to non-public address {ip}")


def _fetch_html(url: str) -> str:
    """Fetch `url`, re-checking the destination at every redirect.

    Redirects are followed by hand because the check has to run again for each hop — a
    permitted URL answering `302 -> http://169.254.169.254` would otherwise walk straight
    past the check on the original address.
    """
    _assert_fetchable(url)

    with httpx.Client(follow_redirects=False, timeout=_TIMEOUT) as client:
        for _ in range(_MAX_REDIRECTS):
            response = client.get(url, headers={"User-Agent": "inzynierka-summarizer/1.0"})

            if response.is_redirect:
                url = str(response.next_request.url)
                _assert_fetchable(url)
                log.debug("scraper following redirect", url=url)
                continue

            response.raise_for_status()
            if len(response.content) > _MAX_BYTES:
                raise ValueError(f"Response exceeds {_MAX_BYTES} bytes")
            return response.text

    raise ValueError(f"Too many redirects (> {_MAX_REDIRECTS})")


async def extract_text_from_url(url: str) -> dict:
    """
    Fetch a URL and return its extracted main text content asynchronously.
    Offloads synchronous networking and CPU-bound parsing to a background thread
    to prevent blocking the main asyncio event loop.
    """
    log.debug("scraper downloading", url=url)

    try:
        downloaded = await asyncio.to_thread(_fetch_html, url)
    except UnsafeUrlError:
        log.warning("scraper url rejected", url=url)
        raise
    except Exception as exc:
        log.exception("scraper download failed", url=url)
        raise ValueError(f"Failed to download URL: {url}") from exc

    if not downloaded:
        log.warning("scraper download empty", url=url)
        raise ValueError(f"Failed to download URL: {url}")

    log.debug("scraper download ok", url=url, bytes=len(downloaded))

    try:
        data = await asyncio.to_thread(trafilatura.bare_extraction, downloaded, with_metadata=True)
        d = data.as_dict()
    except Exception as exc:
        log.exception("scraper extraction failed", url=url)
        raise ValueError("Failed to extract text from downloaded content") from exc

    if not d["text"] or not d["text"].strip():
        log.warning("scraper extraction empty", url=url)
        raise ValueError("Scraping returned empty content")

    return d
