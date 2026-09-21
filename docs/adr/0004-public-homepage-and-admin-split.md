# 0004. Public homepage with a rate-limited endpoint, everything else under /admin

**Status:** Accepted
**Date:** 2026-09-21

## Context and Problem Statement

The whole app lived at `/` as a research console: model choice, processing strategy, G-Eval and
four spec selects. That is the right view for the supervisor and the defence, and a wall of
controls for anyone arriving from a link. The thesis goal is a tool that summarizes a web
resource for a visitor, so the entry point needs an anonymous path. An anonymous path spends real
money: every request calls a paid LLM, and there are no user accounts to attribute or ban.

## Decision Drivers

* A visitor summarizes with no login and sees nothing persisted on screen
* Every request is still stored, because debugging the prompts needs the inputs and raw outputs
* The paid budget must survive an open endpoint, without adding infrastructure (no Redis)
* Cloud Run scales to several instances, so per-process state cannot be the limiter
* The research console keeps its full control surface and its own route prefix

## Considered Options

* Loosen `POST /api/v1/jobs/summarize` to accept anonymous calls
* A separate `POST /api/v1/public/summarize` with a narrower request
* Rate limit in process memory (`slowapi` default backend)
* Rate limit counted in MongoDB with a TTL index

## Decision Outcome

Chosen: **a separate public endpoint** with a request that carries only a source, a language and
a spec, and **a sliding-window limiter counted in MongoDB**. The console moves to `/admin/*`,
`/` is the public page, `/login` is a single password field.

The public endpoint fixes the model (`public_summary_model`), the strategy (`direct`) and
`run_deepeval=False`, rejects `extra_instructions`, accepts only languages from
`supported_summary_languages`, and caps pasted text at 30 000 characters. Jobs it creates carry
`origin="public"`; list endpoints filter on it.

### Consequences

* Good — the authenticated endpoint keeps its contract; the anonymous surface is what the
  public request model declares and nothing else
* Good — the limiter is correct across Cloud Run instances and needs no new dependency
* Bad — the limit is per IP, so a caller with many addresses is not stopped; it bounds a casual
  abuser and an accident, and a determined one still costs money
* Bad — count-then-insert is not atomic, so parallel requests from one IP can exceed the limit
  by a few
* Bad — the client address is the rightmost `X-Forwarded-For` entry, which is correct only while
  Google's front end is the last proxy; a load balancer placed in front breaks that assumption
* Bad — the read endpoints stay public, so text a visitor submitted is retrievable by anyone who
  knows its job id or lists jobs
* Neutral — a scraped URL is not capped by the 30 000 character limit

## Pros and Cons of the Options

### Loosen the existing endpoint

* `+` One code path
* `−` The public caller could choose the model, the strategy and `run_deepeval`

### Separate public endpoint

* `+` The anonymous contract is small and reviewable
* `−` A second route to keep in step with the first (mitigated by a shared request base and a
  shared `queue_summarization_job`)

### In-process limiter

* `+` No storage
* `−` Each Cloud Run instance counts separately, so the effective limit grows with the instance count

### MongoDB limiter

* `+` Shared state, TTL cleans itself, no new service
* `−` One extra write and one count per public request

## Confirmation

`backend/tests/test_public_summarize.py` covers the window, `Retry-After`, the address rule and
the request contract. Manually: six `POST /api/v1/public/summarize` calls in an hour from one
address return 429 on the sixth.
