# Role & Context

You are an expert Python/React developer assisting a Senior Platform Engineer on a B.Sc. Engineering Thesis: "A System for Summarization of Web Content Using Large Language Models."

- **Author:** Piotr Konkol (part-time IT student, Gdańsk University of Technology).
- **Promoter:** dr hab. inż. Julian Szymański.
- **Thesis deadline:** December 2026.

**Goal:** Automatic, coherent summarization of web resources for a user-specified topic, drawing both from the selected resource and from automatically discovered, semantically related materials.

**Trajectory (research phase, later):** Evolve into an agent system evaluating cognitive value and semantic novelty of text, filtering "pseudo-profound" content (inspired by AllenAI Autodiscovery). Do not write code for this phase unless explicitly asked.

## Deliverables (roadmap)

1. Summarization algorithm — 3 modes implemented (`summary_simple`, `summary_sequential`, `summary_cascade` in `backend/app/services/llm/`). Current work: unifying prompts across modes, not building from scratch.
2. Query Expansion / Deep Search — **not started.** No code, not in current TODO/backlog.
3. User interface — React/TypeScript web app, including a `/research` subpage for evaluation sets/runs. Built.
4. Evaluation — the most built-out area: deepeval (G-Eval, pairwise G-Eval), cross metrics (ROUGE/METEOR), deterministic metrics, evaluation sets/runs (`backend/app/routers/research.py`, `backend/app/services/metrics/`, `evaluation_run*.py`).

**Current phase:** MVP + evaluation pipeline are functional and deployed (GCP, CI/CD via GitHub Actions, JWT auth). Active work: prompt unification across summarization modes, generating baseline datasets (CNN/Newsroom + own high-quality-model outputs) for evaluation, and starting the thesis writeup (Overleaf). Query Expansion (Deliverable 2) is the main remaining unstarted deliverable.

## Stack

- **Backend:** Python 3.11+, FastAPI, Pydantic v2, MongoDB via `motor`, LangChain (multi-provider: Gemini/OpenAI/Ollama).
- **Frontend:** React + TypeScript, Vite, Tailwind, Firebase Hosting.
- **Infra:** Terraform, Docker Compose.
- **Evaluation:** deepeval, rouge-score, nltk, spacy, textstat.

Folder-specific rules live in `.claude/rules/` and load only when the matching files are
opened: [backend](.claude/rules/backend.md), [frontend](.claude/rules/frontend.md),
[infra](.claude/rules/infra.md).

## Running checks

`just` is the only entry point; CI runs these exact recipes, so nothing can drift.

```
just              # list recipes
just lint         # ruff, biome, tsc, pytest — seconds, no containers
just fix          # apply formatting and safe fixes
just security     # gitleaks, trivy, hadolint, actionlint, zizmor — needs Docker
just ci           # everything CI runs
```

@docs/adr/README.md

## Universal rules

- **Scope lock.** Implement only what was asked for this step. Do not build for future roadmap items ahead of time.
- **Low cognitive load.** Maintainability and readability beat cleverness. No abstractions (interfaces, base classes, config layers) unless the current step actually needs them.
- **Reviewable batches.** Prefer several small, reviewable steps over one large diff.
- **Architecture pushback.** If a requested approach isn't the best option, say so in the reply and propose the alternative — don't silently comply or silently deviate.
- **Naming: verbose first, narrow later.** Prefer long, self-explanatory names over short ones, especially for state, function, and variable names that aren't obviously scoped by their immediate context. A name should let a reader understand its purpose without re-reading the surrounding module. Don't abbreviate to save keystrokes (`client` → `firestoreClient` if there are multiple clients in scope; `runModel` → `newRunSelectedModel` if "run" is ambiguous between "existing run" and "the run being created"). It's fine to shorten a name later once its scope is small and unambiguous (e.g. a loop variable `i` is fine) — but don't start short and hope to remember to rename it later; that rarely happens.

## Docs describe the present, not the change — FORBIDDEN patterns

READMEs and docs state only how the system works *now*. They are not a changelog: git history covers that. The same rule as the code — no fallbacks, no leftovers.

- Sentences whose meaning depends on knowing a previous version: "no longer", "now also", "used to", "previously", "as of the recent refactor", "the old way was".
- Sections explaining a bug that was already fixed, or why an earlier approach was abandoned.

```markdown
<!-- BAD — only parseable if you remember the version before -->
Auth is off unless `AUTH_ENABLED=true`. Setting only the secrets no longer enables auth.
`summary_data` now also contains `source_url`.
## Why the previous import error happened

<!-- GOOD — describes the current contract, complete on its own -->
Auth is off unless `AUTH_ENABLED=true`; when on, both `AUTH_SECRET` and `JWT_SECRET` must be set or the app refuses to start.
`summary_data` contains `source_url` (original link).
## Running from the repository root
```

The one exception is a **deliberate in-flight migration**, where developers need to know both states. Mark those with a greppable prefix and delete them once the team has migrated:

```markdown
MIGRATION: until 2026-09, both AUTH_SECRET and legacy TOKEN are read. Remove TOKEN support after all envs are cut over.
```

Longer-form writing has its own home, so it does not leak into READMEs:

- `docs/adr/` — why a decision was made, when the code alone can't show it (e.g. public read endpoints, auth as an explicit flag).
- `docs/security/` — a vulnerability, why it worked, and what changed as a result.

## README size and scope

The failure mode is a thousand generated lines nobody reads, drifting from the code. A line
budget is the only thing that reliably prevents it.

- Root README **≤ 60 lines**, per-directory README **≤ 100**. Over budget means removing or
  relocating something, not appending.
- No duplication: if it belongs in `backend/README.md`, the root **links** to it.
- First sentence states the scope of that file.
- Commands only if they are actually run. Bullet points and short sentences, no prose.
- No `Introduction`, `Overview`, `Features`, `Contributing`, `License` unless real.
- No directory-structure listing — it goes stale in a week and `ls` is faster.
- Facts must be verifiable against the code. A Python version in a README has to match the
  Dockerfile, or not be stated at all.

## Commits

Conventional Commits 1.0.0: `type(scope): imperative summary, lowercase, no full stop`.

Types: `feat` `fix` `docs` `refactor` `perf` `test` `build` `ci` `chore` `revert` `style`.
Scopes: `backend` `frontend` `infra` `ci` `eval` `llm` `docs` `deps`.

- No `wip:` — squash before it reaches `master`.
- Breaking change: `feat(backend)!:` or a `BREAKING CHANGE:` footer.
- Header ≤ 72 characters. The body answers **why**, not what — the diff shows what.
- `style:` should be rare now that formatters run; that is the point of having them.

## Comments — FORBIDDEN patterns

These rules govern **comments you write**. They do not apply to the author's own scratch notes (see below).

Every comment you add is in **English**, addressed to a co-developer or downstream client-developer reading this repo cold. Never Polish, never a note to self.

- Restating what the line already says. If the code makes it obvious, delete the comment.
- Explaining *what* instead of the non-obvious *why*.

```hcl
# BAD — the code already says this
# Browser origins allowed to call the API. Both hosting domains are derived from the project id.
CORS_ALLOWED_ORIGINS = jsonencode(["https://${var.project_id}.web.app"])

# GOOD — the why, which is not visible anywhere in the code
"roles/firebasehosting.admin", # Deploy the frontend via ADC instead of a long-lived FIREBASE_TOKEN.
```

Formatting:

- **Prefer a trailing comment on the same line** over a comment line above it, when it fits the idea.
- **Line-length limits do not apply to comments.** 200 characters on one comment line is fine — do not wrap a comment just to satisfy a formatter.

### Scratch notes are the author's — do not touch

Markers like `TODO:`, `FIXME:`, `WIP:`, `REMOVE:`, `TMP:` are a deliberate mechanism: a greppable place to park something that has nowhere better to live yet, meant to be deleted later. They are exempt from every rule above — they may be terse, messy, or in Polish.

- Never delete, reword, or "clean up" a marked note written by the author. Answer it if you can, and say so — the author decides whether it goes.
- When you add one yourself, use English and say what would resolve it.
