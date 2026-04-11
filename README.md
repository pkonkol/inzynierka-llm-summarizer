# Web Summarization Thesis Monorepo

Monorepo for the B.Sc. Engineering Thesis project: system for summarization of web content using LLMs.

## Structure

```text
backend/   FastAPI API, scraping, summarization pipeline, async job flow
frontend/  React + TypeScript client app (UI)
infra/     Infrastructure assets (Docker, Kubernetes manifests, scripts)
```

## Quick Start
Start local infrastructure (MongoDB):

```bash
./dev.sh up
```

Run backend from repository root:

```bash
uvicorn backend.app.main:app --reload
```

Backend details and setup are documented in `backend/README.md`.

Stop local infrastructure:

```bash
./dev.sh down
```
