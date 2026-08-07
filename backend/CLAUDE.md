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
