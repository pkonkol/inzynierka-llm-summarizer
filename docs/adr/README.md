# Architecture Decision Records

One record per decision that could plausibly be revisited **as a unit**. The table below is
imported into the root `CLAUDE.md`, so keep each row to one line.

| # | Decision | Outcome | Status |
|---|---|---|---|
| [0001](0001-static-analysis-and-cicd-toolchain.md) | Static analysis and CI/CD toolchain | ruff, Biome, Trivy, gitleaks, `just`; no CodeQL, no branch protection | Accepted |
| [0002](0002-structured-logging-with-structlog.md) | Structured logging | structlog with named fields and contextvars; own formatters deleted | Accepted |
| [0003](0003-summary-spec-and-processing-strategy.md) | SummarySpec vs. processing strategy | Output contract (SummarySpec) kept independent of execution strategy (direct/extract_then_synthesize) | Accepted |
| [0004](0004-public-homepage-and-admin-split.md) | Public homepage vs. /admin | Separate rate-limited public endpoint (Mongo sliding window), console moved under /admin | Accepted |
| [0005](0005-single-markdown-summary-field.md) | Summary output shape | One markdown `summary` field replaces the exclusive summary/key_takeaways pair; one-off backfill | Accepted |

## Granularity

The failure mode is one ADR per tool: after six months there are sixty, nobody reads them,
and the index is useless. The test is **"would I revisit only this, without touching the
rest?"** — `just` instead of `make` fails that test (the whole toolchain would be revisited
together), so it is a *Considered Option* inside 0001 rather than its own record.

Target for the whole thesis: 10–15 records. Past 25, the granularity is too fine.

## Conventions

- Format: [MADR 4.x](https://adr.github.io/madr/), written in English. Template:
  [0000-template.md](0000-template.md).
- Filename: `NNNN-short-title.md`, numbered from `0001`.
- **An accepted ADR is never edited.** Superseding it means writing a new one and setting
  the old record's status to `Superseded by ADR-XXXX`. These are a historical record, not
  living documentation.
- Write one when a decision is expensive to reverse, or when it would have to be explained
  at the thesis defence. Do not write one for a library with no alternatives, or for
  anything already obvious from the code.
- The *Consequences → Bad* section is mandatory. An ADR with no downsides is an ADR that is
  hiding them.

## Backlog

Decisions already made but not yet written up: data store (MongoDB) · LLM layer
(multi-provider abstraction plus the three summarisation modes, as one decision) ·
evaluation framework (deepeval + G-Eval) · deployment model (Cloud Run, Firebase Hosting
and WIF, as one decision) · no automated tests as a deliberate MVP trade-off.
