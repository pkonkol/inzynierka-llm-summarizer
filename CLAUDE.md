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

Folder-specific rules: [backend/CLAUDE.md](backend/CLAUDE.md), [frontend/CLAUDE.md](frontend/CLAUDE.md), [infra/CLAUDE.md](infra/CLAUDE.md).

## Universal rules

- **Scope lock.** Implement only what was asked for this step. Do not build for future roadmap items ahead of time.
- **Low cognitive load.** Maintainability and readability beat cleverness. No abstractions (interfaces, base classes, config layers) unless the current step actually needs them.
- **Reviewable batches.** Prefer several small, reviewable steps over one large diff.
- **Architecture pushback.** If a requested approach isn't the best option, say so in the reply and propose the alternative — don't silently comply or silently deviate.
- **Naming: verbose first, narrow later.** Prefer long, self-explanatory names over short ones, especially for state, function, and variable names that aren't obviously scoped by their immediate context. A name should let a reader understand its purpose without re-reading the surrounding module. Don't abbreviate to save keystrokes (`client` → `firestoreClient` if there are multiple clients in scope; `runModel` → `newRunSelectedModel` if "run" is ambiguous between "existing run" and "the run being created"). It's fine to shorten a name later once its scope is small and unambiguous (e.g. a loop variable `i` is fine) — but don't start short and hope to remember to rename it later; that rarely happens.
