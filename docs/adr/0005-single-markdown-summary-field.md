# 0005. One markdown `summary` field instead of two mutually exclusive outputs

**Status:** Accepted
**Date:** 2026-09-22

## Context and Problem Statement

A summary was stored as either `summary` (prose) or `key_takeaways` (a list), chosen by
`output_format`, with the other field left null. Every consumer had to know that rule:
`evaluated_output_text` picked whichever was set, `join_takeaways` rebuilt the `- a` lines the
metrics judged, and two families of metric fields and GEval judges existed for the same text. The
public page now offers a bullet list as one summary kind next to prose and a one-sentence kind, so
the list is a way of formatting a summary and no longer a second output.

## Decision Drivers

* One place to read the result, in the API, the metrics and the evaluation pipeline
* Historical jobs and evaluation runs are thesis research records and must stay readable
* The text the metrics judge for a bullet list must not change, so old and new runs compare
* A migration that touches production data has to be reviewable and repeatable

## Considered Options

* Keep both fields and add a preset with `output_format="bullets"`
* One `summary` string in markdown; the model formats the list itself

## Decision Outcome

Chosen: **one `summary` string in markdown**. Every strategy answers with `{summary}`; for
`output_format="bullets"` the guidance asks for a markdown list. The extraction stage of
`extract_then_synthesize` still returns a list internally, and it is kept in `raw_output`.
`key_takeaways` leaves `SummaryResponse`, the job and run metrics and the evaluation entries.

A one-off script, `backend/scripts/backfill_summary_markdown.py`, copies each stored
`key_takeaways` list into `summary` as `"- a\n- b"` (exactly what `join_takeaways` produced) and
stamps `origin="admin"` on older jobs. It leaves the old fields in place. It has to run before
the deployment, because the new code requires `summary` to be a string.

### Consequences

* Good — one field to read, and the branching on which of the two is set disappears
* Good — the text judged for a bullet list is identical to before, so results stay comparable
* Bad — the count of bullets is no longer stored; it can be recomputed from the lines of `summary`
* Bad — the list format depends on the model: it may answer with `*`, numbering or nesting, and
  ROUGE, METEOR and `length_ratio` then count markdown characters
* Bad — the migration rewrites research records and is applied by hand to production; a copy of
  both collections should exist before it runs
* Neutral — `summary_covers_takeaways` is dropped, since after merging it would compare a text
  with itself; `takeaways_non_redundancy` and `takeaways_coverage` remain and run for bullet output

## Pros and Cons of the Options

### Keep both fields

* `+` No migration, no change to the evaluation pipeline
* `−` The exclusion rule stays in every consumer and in two metric families

### One markdown field

* `+` A single shape end to end
* `−` A one-off migration of stored data

## Confirmation

`backend/tests/test_llm_base.py` asserts the bullet guidance appears only for `bullets`, and
`test_run_metrics.py` asserts the list-quality judges run only for a bullet list. The script was
exercised on a scratch database: a dry run writes nothing, a real run converts, a second run
touches nothing.
