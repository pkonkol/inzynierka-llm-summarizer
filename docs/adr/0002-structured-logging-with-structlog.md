# 0002. Structured logging with structlog

**Status:** Accepted
**Date:** 2026-08-12

## Context and Problem Statement

Logging worked but produced text, not data. Every call baked its values into the message:
`log.debug("Scraper: downloading url=%s", url)`. Cloud Logging therefore saw one
unstructured string, and questions like "show me every failure for this URL" or "what did
this job cost" could not be answered without reading the database.

Two supporting problems. `core/logging.py` had grown to 141 lines of hand-written
formatters — an ANSI colouriser, a JSON bracket rainbow, a separate Cloud Logging
formatter. And correlation was manual: `job_id` was threaded through as an argument to
every function that might log, and dropped by any that forgot.

Uvicorn made it worse in production: it installs its own handlers with `propagate = False`,
so its startup and access lines reached Cloud Logging as unstructured text with no
severity, while the application's own lines arrived as JSON.

## Decision Drivers

* Fields must be individually queryable in Cloud Logging, not embedded in a string
* Correlation by `job_id` across scraper → LLM → metrics, in async background tasks
* Less hand-written code, not more
* Local output must stay readable — colour is the reason DEBUG is usable at all
* One format for the whole process, application and libraries alike

## Considered Options

* **structlog**
* stdlib `logging` with `extra={}` and a custom JSON formatter
* loguru

## Decision Outcome

**structlog**, configured through `structlog.stdlib.ProcessorFormatter` so that records
from third-party libraries flow through the same pipeline as the application's own.

`ConsoleRenderer` locally, `JSONRenderer` on Cloud Run with `level` renamed to `severity`
and `event` to `message` — the two keys Cloud Logging treats specially. Everything else
lands in `jsonPayload` and becomes filterable.

Correlation uses `structlog.contextvars`: `bind_contextvars(job_id=..., mode=...)` once at
the start of a background job, released in a `finally`. Below that boundary nothing passes
`job_id` around, and lines emitted by the scraper, the LLM router and the metrics writers
all carry it — including records from libraries.

Colour is configured rather than accepted as-is, because structlog's defaults render debug
and info in the same green and error and critical in the same red, which defeats the point.
Beyond level colours, the canonical job fields get their own hues so a line is scannable
without reading the keys: correlation identifiers in magenta, the model call in cyan,
measurements in yellow.

### Consequences

* Good — 141 lines of hand-written formatters deleted; the replacement config is ~110 lines
  and almost all of it is declarative
* Good — every field is queryable in Cloud Logging, so cost and failure questions can be
  answered from logs
* Good — uvicorn's output is now JSON with a severity as well, so production has one format
* Good — the API mirrors the frontend's `logger.ts`, so both halves describe events alike
* **Bad** — one more runtime dependency, and its API is not stable across majors:
  `structlog.dev.default_columns()` does not exist in 26.1, so the column list is built by
  extending `renderer.columns`, which is a private-ish surface
* **Bad** — 26 call sites rewritten by hand; the change is mechanical but not automatic
* Neutral — `contextvars` must be released explicitly, since FastAPI can run several
  background tasks in one asyncio task and a leaked binding would mislabel the next job

## Pros and Cons of the Options

### structlog

* `+` Named fields are the native API, not a bolt-on
* `+` `contextvars` integration solves correlation without threading arguments
* `+` Composable processor chain, so redaction or sampling can be added in one place
* `+` Integrates with stdlib, so third-party records get the same treatment
* `−` More setup than loguru; the processor chain has to be understood before it is changed

### stdlib logging with `extra={}`

* `+` No new dependency
* `−` Keys in `extra` silently collide with `LogRecord` attributes
* `−` No context binding, so `job_id` stays a parameter on every function
* `−` `log.info("done", extra={"url": url, "job_id": job_id})` at every call site

### loguru

* `+` The most popular of the three, and the shortest setup
* `−` Optimised for ergonomics rather than structure
* `−` No `contextvars` equivalent, which is the main reason for the change

## Confirmation

`LOG_FORMAT=json` produces one JSON object per line with a `severity` field, including
uvicorn's. In Cloud Logging, `jsonPayload.job_id = "..."` returns every line for one job,
across the scraper, the LLM layer and the metrics writers.
