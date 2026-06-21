import logging

from .config import settings

# ANSI colors
_RESET = "\033[0m"
_BOLD = "\033[1m"
_DIM = "\033[2m"
_RED = "\033[31m"
_YELLOW = "\033[33m"
_CYAN = "\033[36m"
_GREEN = "\033[32m"
_MAGENTA = "\033[35m"
_BLUE = "\033[34m"
_WHITE = "\033[37m"

_LEVEL_COLORS = {
    "DEBUG": _CYAN,
    "INFO": _GREEN,
    "WARNING": _YELLOW,
    "ERROR": _RED + _BOLD,
    "CRITICAL": _MAGENTA + _BOLD,
}

# JSON bracket rainbow — highlights nesting depth mod 4
_JSON_COLORS = [_CYAN, _YELLOW, _GREEN, _MAGENTA]


def _colorize_json(text: str) -> str:
    """Rainbow-color JSON brackets by nesting depth."""
    result = []
    depth = 0
    for ch in text:
        if ch in "{[":
            color = _JSON_COLORS[depth % len(_JSON_COLORS)]
            result.append(f"{color}{ch}{_RESET}")
            depth += 1
        elif ch in "}]":
            depth = max(0, depth - 1)
            color = _JSON_COLORS[depth % len(_JSON_COLORS)]
            result.append(f"{color}{ch}{_RESET}")
        else:
            result.append(ch)
    return "".join(result)


class _AppFormatter(logging.Formatter):
    """Colored formatter with line numbers for app.* loggers."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        level_color = _LEVEL_COLORS.get(record.levelname, "")
        level_str = f"{level_color}{record.levelname:<8}{_RESET}"

        name_str = f"{_DIM}[{record.name}"
        # add :lineno only for our own code
        if record.name.startswith("app."):
            name_str += f":{record.lineno}"
        name_str += f"]{_RESET}"

        ts = self.formatTime(record, self.datefmt)
        ts_str = f"{_DIM}{ts}{_RESET}"

        msg = record.getMessage()
        if record.exc_info:
            msg += "\n" + self.formatException(record.exc_info)

        # pretty-print JSON blobs inside the message
        if "{" in msg or "[" in msg:
            msg = _colorize_json(msg)

        return f"{ts_str} {level_str} {name_str} {msg}"


# Noisy third-party loggers to suppress at DEBUG level
_QUIET_IN_DEBUG = [
    "pymongo",
    "httpcore",
    "httpx",
    "openai._base_client",
    "urllib3",
    "asyncio",
]


def setup_logging() -> None:
    level = logging.DEBUG if settings.debug else logging.INFO

    root = logging.getLogger()
    root.setLevel(level)

    # remove any handlers basicConfig may have added
    root.handlers.clear()

    handler = logging.StreamHandler()
    handler.setLevel(level)
    handler.setFormatter(_AppFormatter(datefmt="%Y-%m-%d %H:%M:%S,%f"[:-3]))
    root.addHandler(handler)

    # silence noisy libs when debug is on
    if settings.debug:
        for name in _QUIET_IN_DEBUG:
            logging.getLogger(name).setLevel(logging.WARNING)

    print(f"Logging initialized — level: {'DEBUG' if settings.debug else 'INFO'}")
