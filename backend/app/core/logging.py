import logging

from .config import settings


def setup_logging() -> None:
    print(f"Logging initialized. Level: {'DEBUG' if settings.debug else 'INFO'}")
    print(f"Settings: {settings}")
    logging.basicConfig(
        level=logging.DEBUG if settings.debug else logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
