# 0003. Separate SummarySpec (output contract) from processing strategy (how it's produced)

**Status:** Accepted
**Date:** 2026-09-14

## Context and Problem Statement

Length, register and output shape were controlled by a single hardcoded sentence
(`"Keep the result concise but complete."`), with no way to ask for a specific length, stance or
function. At the same time, the three summarization modes (`simple`, `sequential`, `cascade`)
mixed two unrelated things: how many LLM calls run and in what shape (a technical/execution
detail), and what the final output must look like (a content contract, including whether
`key_takeaways` exists at all). This showed up concretely when `sequential`'s only reason to
exist — producing two independent outputs — disappeared once `output_format` made "exactly one
output" a rule, and when deciding where the length target for an evaluation run should come from
required three genuinely different sources (a fixed number, a formula scaled to the article, or
matching a golden summary) without leaking that choice into the LLM call layer itself.

Full derivation of the length formula (why `a·N^0.2` over `√N` or a linear function, and the
slider calibration) is in
`.scratch/claude_plans/dlugosc-i-rejestr-podsumowan-analiza.md` (Aneks C) — kept there because it
is measurement-heavy working material for the thesis, not a repeatable architectural decision.

## Decision Drivers

* A length target must be derivable from three different sources without the generation code
  (`direct.py`, `extract_then_synthesize.py`) needing to know which one was used
* "How the model gets to an answer" and "what the answer must look like" must stay independent,
  so a future processing strategy (e.g. a refinement pass) doesn't force a new output contract
* The length-resolution logic must be a pure, directly testable function
* One free-text escape hatch for user instructions, not two — a second box for "focus on X" was
  never worth the extra decision for the user or the extra prompt slot

## Considered Options

* Fold `processing_strategy` into `SummarySpec` as one field
* Keep `processing_strategy` and `SummarySpec` as two separate, orthogonal parameters
* Keep `focus_query` and `extra_instructions` as two separate free-text fields
* Merge them into one free-text field

## Decision Outcome

Chosen: **keep `processing_strategy` separate from `SummarySpec`**, and **one free-text field**
(`extra_instructions`) instead of two.

`SummarySpec` (`backend/app/schemas/summary_spec.py`) is a pure content contract: narrative
stance, function, output format, and a length target resolved through a discriminated
`LengthSpec` union (`explicit`, `scaled_to_input`, `match_reference`) via the pure function
`resolve_target_length()`. `processing_strategy` (`direct` | `extract_then_synthesize`) is passed
alongside it, never inside it, and dispatches in `services/llm/_router.py`. The same
`SummarySpec` can be asked of either strategy — same contract, different route there.

Folding strategy into the spec was rejected because it recreates exactly the coupling this
change removes: a preset or a UI control for "how detailed" should never have to also decide
"how many LLM calls," and a future `extract_then_synthesize` sub-strategy (post-hoc shortening —
see the implementation plan's Phase 6) is far more naturally a new field on the spec or a new
strategy value than a reason to entangle the two axes again.

`focus_query` was removed after implementation; "focus on X" is representable as one sentence of
`extra_instructions`, and the second field bought no expressiveness a single box didn't already
have.

### Consequences

* Good — `resolve_target_length()` is a pure function, unit-tested directly
  (`tests/test_summary_spec.py`) without mocking an LLM call
* Good — `LengthSpec` as a discriminated union makes an invalid combination (e.g. a slider value
  together with explicit words) unrepresentable rather than merely unvalidated
* Good — one instruction field halves the API surface for the least-used input, per direct
  feedback that a second field was not worth the added decision
* Bad — `processing_strategy` and `summary_spec` must be passed and persisted together
  everywhere (`JobDocument`, `EvaluationRunDocument`, `generate_summary()`); nothing at the type
  level stops a caller from pairing a spec resolved for one context with the wrong strategy
* Neutral — a future refinement/shortening sub-strategy will have to decide whether it is a new
  `SummarySpec` field or a new `ProcessingStrategy` value; the module split in
  `extract_then_synthesize.py` (`_extract_takeaways`/`_synthesize`) exists so that decision can be
  made later without restructuring the call

## Confirmation

`backend/app/schemas/summary_spec.py` defines `SummarySpec` and `ProcessingStrategy` as separate
types with no field of one inside the other. `pytest backend/tests/test_summary_spec.py` covers
`resolve_target_length()` for all three length policies. `services/llm/_router.py::generate_summary`
takes both as independent parameters.
