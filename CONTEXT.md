# Project context

B.Sc. Engineering Thesis: "A System for Summarization of Web Content Using Large Language Models".
Rules for working in this repo are in [CLAUDE.md](CLAUDE.md).

- **Author:** Piotr Konkol (part-time IT student, Gdańsk University of Technology).
- **Promoter:** dr hab. inż. Julian Szymański.
- **Thesis deadline:** December 2026.

**Goal (official topic):** Automatic, coherent summarization of web resources for a user-specified topic, drawing both from the selected resource and from automatically discovered, semantically related materials.

## Deliverables (status 2026-09-29)

1. Summarization — done. Output contract `SummarySpec` (function, format, narrative stance) + `LengthSpec`, independent of the processing strategy (`direct` / `extract_then_synthesize`) in `backend/app/services/llm/` ([ADR 0003](docs/adr/0003-summary-spec-and-processing-strategy.md)).
2. Query Expansion — **not started; the last implementation stage.** Scope: web-search context (Brave Search MCP, optionally arXiv/Consensus) pasted into the prompt, public page only, outside the evaluation.
3. User interface — done. Public page `/` (no login, rate-limited, three summary kinds, density slider) and research console under `/admin` ([ADR 0004](docs/adr/0004-public-homepage-and-admin-split.md)).
4. Evaluation — pipeline done: evaluation sets (CNN/DailyMail, Curation Corpus, GUMSum, PSC 1.0), runs, G-Eval and pairwise G-Eval, ROUGE/METEOR, deterministic form metrics (`backend/app/routers/evaluation_*.py`, `backend/app/services/metrics/`). G-Eval is not calibrated yet.

## Remaining work, in order

1. Thesis write-up (Overleaf) — current. Knowledge base and rules: `.scratch/praca_overleaf/`.
2. G-Eval calibration.
3. Larger evaluation runs comparing system summaries with dataset references.
4. Query Expansion (scope above).

On hold: restyling the frontend from Figma. Dropped: the cognitive-value / semantic-novelty research trajectory.

## Stack

- **Backend:** Python 3.14, FastAPI, Pydantic v2, MongoDB via `motor`, `trafilatura`, LangChain (Gemini, OpenRouter via `langchain-openai`, Ollama).
- **Frontend:** React + TypeScript, Vite, Tailwind, Firebase Hosting.
- **Infra:** Terraform, GCP Cloud Run, Secret Manager, GitHub Actions with WIF; Docker Compose locally.
- **Evaluation:** deepeval, rouge-score, nltk, textstat.
