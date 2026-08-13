---
paths:
  - "backend/**/*.py"
---

# Backend rules (FastAPI / Pydantic v2 / Motor / LangChain)

## Parse, don't validate

All input validation happens at the edge — router request bodies (Pydantic schemas) and external API responses. Once data crosses that boundary, downstream code trusts the type completely. Never re-check a value's shape deeper in the call stack.

## No silent fallbacks — FORBIDDEN patterns

- `(value or "")`, `.get(key, "")`, `getattr(obj, "x", None)` used to paper over a value that should already be present. If it's missing, that's a bug upstream — let it raise.
- Catching an exception just to `return None` / `return {}` / continue silently. `except Exception: pass` is banned outright.

```python
# BAD — masks the caller's bug, pushes null-checks onto every consumer
def compute_metrics(reference_text: str | None, summary_text: str | None) -> dict:
    reference = (reference_text or "").strip()
    if not reference:
        return {"rouge1": None, "meteor": None}

# GOOD — trust the type; if it's wrong, the caller finds out immediately
def compute_metrics(reference_text: str, summary_text: str) -> dict:
    reference = reference_text.strip()
    if not reference:
        raise ValueError("reference_text must not be blank")
```

## Pydantic models: only mark a field `| None` if it is genuinely optional in the domain

Don't default to `Optional` "to be safe." A required field that's missing should fail validation at the API boundary, not become everyone's problem downstream.

```python
# BAD — url and source are actually required by every caller
class SourceMeta(BaseModel):
    url: str | None = None
    title: str
    source: str | None = None

# GOOD
class SourceMeta(BaseModel):
    url: str
    title: str
    source: str
```

## Fail fast

Raise (`ValueError`, `HTTPException`, a domain exception) as soon as an invariant is broken. Do not write recovery logic for states that should be impossible given correct upstream validation.

## Stack notes

- Async everywhere for I/O (Mongo via `motor`, LLM calls, scraping) — use `asyncio`/FastAPI `BackgroundTasks`, no blocking calls in request handlers.
- LangChain provider calls go through the existing provider abstraction in `app/services/llm/` — don't add a new ad-hoc client.

## Imports

Five isort sections, in this order: `__future__`, stdlib, third-party, first-party
(absolute), local-folder (relative). ruff `I001` enforces the ordering.

Inside `app/`, always import **relatively** (`from ..core.config import settings`). Every
module does. No lint rule enforces this — ruff's `TID252` enforces the opposite — so it is
on you and on review.

## Logging

structlog, configured in `core/logging.py`. Console renderer locally, JSON with `severity`
on Cloud Run.

- `log = structlog.get_logger(__name__)` at the top of the module. Never the root logger,
  never a logger passed as an argument.
- **Values go in named fields, never interpolated into the message.** The message is a
  constant phrase so Cloud Logging can group by it; the fields land in `jsonPayload` and
  become filterable.
- Canonical field names, so they stay queryable: `job_id` · `request_id` · `url` ·
  `provider` · `model` · `mode` · `duration_ms` · `token_usage` · `status`.
- Bind context at boundaries with `structlog.contextvars.bind_contextvars(...)`, and unbind
  in a `finally`. Below that boundary nobody passes `job_id` around — that is the point.
- Levels: `debug` detail (prompts and model output belong here) · `info` state changes
  visible outside the process · `warning` degraded but handled · `error` via
  `log.exception()` inside `except` · `critical` the process cannot continue.
- Never log a `SecretStr` value, an API key, an `Authorization` header, or full scraped
  text at `info`.
- `print()` is banned in `app/` (ruff `T20`).

```python
# BAD — url is baked into the string, so Cloud Logging cannot filter on it
log.info(f"scraper finished {url} in {ms}ms")

# GOOD
log.info("scraper finished", url=url, duration_ms=ms)
```

**New code ships with its logs.** Every new function in `services/` and every handler in
`routers/` gets `log.debug` on entry, `log.info` on externally visible state changes,
`log.exception` in any `except` that does not immediately re-raise, and
`bind_contextvars` at the start of a new background task. Adding logs later, while
debugging, is the thing this rule exists to prevent.

## Docstrings

Deliberately sparse. Do not enable ruff's `D` rules and do not add docstrings to
self-explanatory functions just to have them.

## Fetching user-supplied URLs

Anything that fetches an address a user chose goes through `_assert_fetchable` in
`services/scraper.py`. See `docs/security/0001-ssrf-scraper.md` for why the short version
of that check does not work.

## Types

`pyrefly`, configured in `pyproject.toml`. Suppress with `# pyrefly: ignore`, never
`# pyright: ignore` — Pylance's type checking is off precisely so there is one tool and one
suppression syntax.

## File layout

One module, one test file: `app/services/x.py` ↔ `tests/test_x.py`. Do not split a helper
into its own module just because it is a distinct concern — a helper with one caller lives
next to that caller.
