import logging

import structlog
from structlog.typing import EventDict, WrappedLogger

from .config import settings

log = structlog.get_logger(__name__)

# Third-party loggers that drown out our own output at DEBUG.
_QUIET_IN_DEBUG = [
    "pymongo",
    "httpcore",
    "httpx",
    "openai._base_client",
    "urllib3",
    "asyncio",
    "trafilatura",
]


# Cloud Logging keys off `severity` for the level and `message` for the summary line;
# every other key lands in jsonPayload and becomes filterable.
def _rename_for_cloud_logging(
    _logger: WrappedLogger, _name: str, event_dict: EventDict
) -> EventDict:
    event_dict["severity"] = event_dict.pop("level").upper()
    event_dict["message"] = event_dict.pop("event")
    return event_dict


# Colour carries meaning in dev output: correlation keys, identity of the model call, and
# measurements each get their own hue, so a line is scannable without reading the keys.
_FIELD_COLOURS = {
    "job_id": structlog.dev.MAGENTA,
    "request_id": structlog.dev.MAGENTA,
    "url": structlog.dev.BLUE,
    "provider": structlog.dev.CYAN,
    "model": structlog.dev.CYAN,
    "mode": structlog.dev.CYAN,
    "duration_ms": structlog.dev.YELLOW,
    "token_usage": structlog.dev.YELLOW,
    "status": structlog.dev.GREEN,
}


def _console_renderer() -> structlog.dev.ConsoleRenderer:
    # structlog ships debug and info in the same green, and error and critical in the same
    # red, which defeats the point of colouring the level at all.
    levels = structlog.dev.ConsoleRenderer.get_default_level_styles()
    levels["debug"] = structlog.dev.CYAN
    levels["critical"] = structlog.dev.MAGENTA

    renderer = structlog.dev.ConsoleRenderer(level_styles=levels)

    named = [
        structlog.dev.Column(
            key,
            structlog.dev.KeyValueColumnFormatter(
                key_style=structlog.dev.DIM,
                value_style=colour,
                reset_style=structlog.dev.RESET_ALL,
                value_repr=str,
            ),
        )
        for key, colour in _FIELD_COLOURS.items()
    ]

    # The column with an empty key is structlog's catch-all and has to stay last. Building
    # on top of renderer.columns rather than rebuilding the default layout by hand keeps
    # timestamp/level/event rendering owned by structlog.
    catch_all = [c for c in renderer.columns if c.key == ""]
    keyed = [c for c in renderer.columns if c.key != ""]
    renderer.columns = [*keyed, *named, *catch_all]
    return renderer


def setup_logging() -> None:
    level = logging.DEBUG if settings.debug else logging.INFO
    to_json = settings.log_format == "json"

    # Applied to structlog calls and to stdlib records from third-party libraries alike,
    # so uvicorn and pymongo end up in the same format as our own events.
    shared = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
    ]

    structlog.configure(
        processors=[*shared, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=True,
    )

    if to_json:
        render = [
            structlog.processors.format_exc_info,
            _rename_for_cloud_logging,
            structlog.processors.JSONRenderer(),
        ]
    else:
        render = [_console_renderer()]

    handler = logging.StreamHandler()
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=shared,
            processors=[structlog.stdlib.ProcessorFormatter.remove_processors_meta, *render],
        )
    )

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # uvicorn installs its own handlers and sets propagate=False, so without this its
    # startup and access lines bypass everything above and reach Cloud Logging as
    # unstructured text with no severity — while ours arrive as JSON.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True

    if settings.debug:
        for name in _QUIET_IN_DEBUG:
            logging.getLogger(name).setLevel(logging.WARNING)

    log.info("logging initialised", level=logging.getLevelName(level), format=settings.log_format)
