# Web Summarization Thesis Monorepo

How to set up, run and check the system for summarizing web content with LLMs (B.Sc. thesis,
see [CONTEXT.md](CONTEXT.md)). Every routine task is a `just` recipe; `just` lists them all.

- [backend/](backend/README.md) — FastAPI API: scraping, summarization jobs, evaluation runs.
- [frontend/](frontend/README.md) — React SPA: public page `/` and research console `/admin`.
- `infra/` — Docker Compose for local MongoDB, Terraform for GCP, model catalogues.

## First run

```bash
brew install just uv            # Docker and Node 22 are assumed
just setup-hooks                # pre-commit hook: gitleaks on staged changes
just venv deps-sync             # backend/venv from the locks
just install-frontend           # npm ci
cp backend/.env.example backend/.env        # fill in API keys
cp frontend/.env.example frontend/.env
```

## Daily work

```bash
just db-up      # MongoDB in Docker
just dev        # backend :8000 and frontend :5173, Ctrl+C stops both
just db-down
```

API docs: http://127.0.0.1:8000/docs · app: http://127.0.0.1:5173

## Checks

```bash
just lint       # ruff, pyrefly, pytest, biome, tsc, OpenAPI and TS type drift — no containers
just fix        # formatting and safe fixes
just security   # gitleaks, trivy, hadolint, npm audit, actionlint, zizmor — needs Docker
just ci         # lint + security
```

CI runs the same recipes on every push ([checks.yml](.github/workflows/checks.yml)); details in
[docs/static-analysis.md](docs/static-analysis.md).

## Deploy

A push to `master` runs [deploy.yaml](.github/workflows/deploy.yaml): checks, backend image to
Cloud Run (image scan, smoke test, rollback on failure), frontend to Firebase Hosting.

## Decisions

Architecture decisions: [docs/adr/](docs/adr/README.md). Security write-ups: [docs/security/](docs/security/).
