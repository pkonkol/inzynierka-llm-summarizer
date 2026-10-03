# Backend (FastAPI)

How to install, run and debug the API that scrapes pages, runs summarization jobs and evaluation
runs. Recipes run from the repository root; Python 3.14, MongoDB via `just db-up`.

## Setup

```bash
just deps-sync                           # backend/.venv from uv.lock, dev group included
cp backend/.env.example backend/.env     # all other settings: app/core/config.py
```

`backend/.env` is loaded by Pydantic Settings wherever the process starts.

- Auth is off unless `AUTH_ENABLED=true`; when on, both `AUTH_SECRET` and `JWT_SECRET` must be set
  or the app refuses to start.
- `DEBUG=true` logs every pipeline step (prompts and model output included). `LOG_FORMAT=json` is
  what Cloud Run uses.
- `SUPPORTED_MODELS` is one JSON line, minified from `infra/supported_models*.json`.

## Run

```bash
just dev-backend      # uvicorn --reload on :8000, also reloads on .env edits
just smoke-backend    # does the app import and wire up its routes
```

Swagger: http://127.0.0.1:8000/docs · health: http://127.0.0.1:8000/health

| Prefix | What |
|---|---|
| `/api/v1/public` | rate-limited summarize for the public page |
| `/api/v1/jobs` | summarize jobs for the console; writes need a token when auth is on |
| `/api/v1/research` | evaluation sets and evaluation runs |
| `/api/v1/meta` | models, languages, presets, version |
| `/auth` | login status and token |

After changing a route or schema: `just export-openapi`, then `npm run generate-types` in
`frontend/`. `just lint` fails while either file is stale.

## Dependencies

- `pyproject.toml` — direct dependencies with `~=X.Y` ranges; the `dev` group holds test and reload tooling.
- `uv.lock` — generated lock with exact versions and hashes, valid on Linux (the image) and macOS.
  The image installs it without the `dev` group. Never edit it by hand.

```bash
uv add 'pyjwt~=2.15'                        # add a dependency or change its range, relocks
uv tree --outdated --depth 1                # direct dependencies with newer releases
just deps-lock --upgrade-package fastapi    # move one package within its range
just deps-lock --upgrade                    # move everything
just deps-sync                              # install uv.lock into .venv
```

## Checks

```bash
just lint-backend        # ruff check + format check
just typecheck-backend   # pyrefly
just test-backend        # pytest
```

## Image

```bash
just build-backend    # tag inzynierka-backend:local
just smoke-image      # GEval importable, pytest pruned, METEOR reads wordnet
just scan-image       # trivy on the built image
```

## Debugging without just

From `backend/`:

```bash
uv run uvicorn app.main:app --reload --port 8000
uv run pytest tests/test_scraper.py -k non_public -x -vv
```

Queue a job through the public endpoint and poll it until `status` is `completed` or `failed`
(`pending` → `running` → …):

```bash
curl -s -X POST http://localhost:8000/api/v1/public/summarize \
  -H 'Content-Type: application/json' -d '{"url": "https://example.com"}'
curl -s http://localhost:8000/api/v1/jobs/<job_id>
```

`POST /api/v1/jobs/summarize` takes the same body plus `model_provider` and `model_name`; the
valid pairs come from `GET /api/v1/meta/models`.
