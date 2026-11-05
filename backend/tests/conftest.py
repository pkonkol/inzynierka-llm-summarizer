from collections.abc import Callable

import httpx
import pytest

from app.core.nltk_data import ensure_nltk_resources

HttpHandler = Callable[[httpx.Request], httpx.Response]


@pytest.fixture
def serve_http(monkeypatch: pytest.MonkeyPatch) -> Callable[[HttpHandler], None]:
    """Routes every httpx.AsyncClient created during the test to `handler`; nothing leaves the machine."""
    real_async_client = httpx.AsyncClient

    def install(handler: HttpHandler) -> None:
        def client_with_mock_transport(*args: object, **kwargs: object) -> httpx.AsyncClient:
            kwargs["transport"] = httpx.MockTransport(handler)
            return real_async_client(*args, **kwargs)

        monkeypatch.setattr(httpx, "AsyncClient", client_with_mock_transport)

    return install


@pytest.fixture(scope="session", autouse=True)
def nltk_resources() -> None:
    """The sentence splitter and METEOR read nltk data that a fresh CI runner does not have yet."""
    ensure_nltk_resources()
