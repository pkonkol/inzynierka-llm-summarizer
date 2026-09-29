# Backend (FastAPI)

How to install, run and debug the API that scrapes pages, runs summarization jobs and evaluation
runs. Recipes run from the repository root; Python 3.14, MongoDB via `just db-up`.

## Setup

```bash
just venv deps-sync                      # backend/venv from requirements.txt + requirements-dev.txt
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

- `requirements.in` / `requirements-dev.in` — direct dependencies, edited by hand, pinned with `~=`.
- `requirements.txt` / `requirements-dev.txt` — generated locks, exact versions. The image installs
  `requirements.txt`. Never edit a lock by hand.

```bash
just deps-compile                             # after editing a .in file; existing pins stay
just deps-compile --upgrade-package fastapi   # move one package
just deps-compile --upgrade                   # move everything
just deps-sync                                # install the locks into venv
```

The locks are `--universal`, so one file is valid on Linux (the image) and macOS.

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
./venv/bin/python -m uvicorn app.main:app --reload --port 8000
./venv/bin/python -m pytest tests/test_scraper.py -k non_public -x -vv
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
