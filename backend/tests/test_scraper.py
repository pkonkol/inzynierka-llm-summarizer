"""Regression tests for the scraper's SSRF guard.

One case per bypass class, not one per spelling — the full list of forms a naive
implementation misses is in docs/security/0001-ssrf-scraper.md §5.
"""

import pytest

from app.services.scraper import UnsafeUrlError, _assert_fetchable

REJECTED = [
    pytest.param("http://2130706433/", id="loopback-as-decimal"),
    pytest.param("http://[::ffff:169.254.169.254]/", id="metadata-as-ipv4-mapped-ipv6"),
    pytest.param("http://169.254.169.254/", id="cloud-metadata"),
    pytest.param("http://10.0.0.1/", id="rfc1918"),
    pytest.param("file:///etc/passwd", id="non-http-scheme"),
]


@pytest.mark.parametrize("url", REJECTED)
def test_rejects_non_public_targets(url: str) -> None:
    with pytest.raises(UnsafeUrlError):
        _assert_fetchable(url)


def test_allows_ordinary_public_url() -> None:
    _assert_fetchable("https://example.com/article")
