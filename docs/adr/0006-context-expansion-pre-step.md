# 0006. Context expansion as a staged step before the processing strategy

**Status:** Accepted
**Date:** 2026-11-03

## Context and Problem Statement

The thesis topic asks for summaries that draw on the selected page and on automatically
discovered, related material. Finding that material is a search problem with its own failure
modes (provider outages, paid quotas, text from untrusted sites), while the processing strategies
of ADR 0003 only decide how one text becomes one summary. The step has to be cheap and fast enough
for the public page, and reproducible enough to compare in an evaluation run with and without it.

## Decision Drivers

* Summary output contract (ADR 0003) stays independent of where the input came from
* Seconds and cents per summary on the public page, where a visitor waits for the result
* Reproducible runs: the queries, results and picks of every summary are stored
* A provider outage must not take the whole feature down, and must never pass silently
* Text from other sites is untrusted input to the summary prompt

## Considered Options

* One web search with the source's opening as the query (`single_search`)
* Staged pipeline: the model writes queries per channel, Exa, HN Algolia and OpenAlex search in
  parallel, the model picks up to four sources (`staged`)
* Agent with search tools deciding when it has enough (LangGraph or a provider agent SDK)
* Off-the-shelf deep research (open_deep_research, GPT Researcher)
* A third `ProcessingStrategy` that searches and summarizes in one place

## Decision Outcome

Chosen option: **staged pipeline, run as a step before the strategy**, because it keeps the
"think in stages" behaviour the supervisor asked for at a fixed cost: two model calls plus about
six searches, roughly 20 s and 0.02 USD of search per summary. `services/context_expansion/`
returns a `ContextExpansionResult` stored on the job or run entry; the direct strategy receives
the picked sources through `LlmSummaryRequest.related_sources`. `single_search` stays as the
baseline arm of the experiment, and `none` is the default everywhere.

### Consequences

* Good — strategies stay unaware of search; ADR 0003 holds without changes
* Good — every summary records its queries, per-channel counts, cost, errors and picks
* Good — summaries without related sources use the unchanged prompt, so earlier runs compare
* Bad — the public toggle adds about 20 s and a paid Exa call per summary
* Bad — three new external dependencies, two of them with API keys and quotas
* Bad — related sources open a prompt injection path; delimiters and sanitizing reduce it, they do not remove it
* Bad — only the direct strategy takes related sources; extract_then_synthesize rejects them
* Neutral — the experiment is ten fresh pages, so its result is directional

## Pros and Cons of the Options

### Single search

* `+` cheapest, no model calls, simplest code
* `−` the source's opening is a poor query, and there is no choice among results

### Staged pipeline

* `+` fixed number of steps, so cost and time are predictable and runs are reproducible
* `−` the model cannot search again when the first queries miss

### Agent with tools

* `+` can follow leads and decide when to stop
* `−` 3–5× the tokens and minutes per summary, low run-to-run repeatability, and the agent loop
  owns the run, which `LlmSummaryResult` does not model

### Off-the-shelf deep research

* `+` mature research graphs
* `−` produces a long report instead of a summary in a requested form, and costs 0.6–1.4M tokens per report

### Third processing strategy

* `+` one place to look
* `−` mixes "where the input comes from" with "how a summary is made", which ADR 0003 separates

## Confirmation

`backend/app/services/context_expansion/` exists, `ProcessingStrategy` still has two values, and
`tests/test_context_expansion_pipeline.py` and `tests/test_direct.py` pass.
