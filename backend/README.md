# Backend (FastAPI)

## Purpose
Backend API for web content summarization jobs.

## Requirements
- Python 3.14

## Install
From the `backend` directory:

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Dependencies

Two files, on purpose:

- **`requirements.in`** — the ~14 direct dependencies, edited by hand, pinned with `~=` so patch
  releases are allowed.
- **`requirements.txt`** — the generated lock: every transitive dependency at an exact version.
  This is what `pip install` and the Docker build use, so a given commit always builds the same
  image.

Never edit `requirements.txt` by hand. After changing `requirements.in`, or to pick up patch
releases, recompile it with [uv](https://docs.astral.sh/uv/) (dev-machine tool only — it is not
used in the image or in CI):

```bash
uv pip compile requirements.in -o requirements.txt --universal --python-version 3.14

uv pip compile requirements.in -o requirements.txt --universal --python-version 3.14 --upgrade
uv pip compile requirements.in -o requirements.txt --universal --python-version 3.14 \
    --upgrade-package fastapi
```

`uv pip compile` keeps existing pins unless you pass `--upgrade`/`--upgrade-package`, so versions
never move on their own. `--universal` makes the single lock file valid on both Linux (the image)
and macOS (this venv).

## Environment Variables
Preferred: keep API keys in `backend/.env`:

```env
GEMINI_API_KEY=your_key_here
DEBUG=true
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=web_summarization
MONGODB_JOBS_COLLECTION=jobs
```

The app loads `backend/.env` automatically via Pydantic Settings, regardless of where you start Uvicorn.
See `.env.example` for the full list, including `AUTH_ENABLED`, `LOG_FORMAT` and
`CORS_ALLOWED_ORIGINS`.

Auth is off unless `AUTH_ENABLED=true`; when it is on, both `AUTH_SECRET` and `JWT_SECRET` must be
set or the app refuses to start.

Optional summary tuning variables:

```env
SUMMARY_BASE_OUTPUT_TOKENS=300
SUMMARY_TOKENS_PER_1000_CHARS=120
SUMMARY_MAX_OUTPUT_TOKENS=1600
```

When `DEBUG=true`, backend logs detailed steps of: queueing job, scraping, LLM call, and final status.

Jobs are persisted in MongoDB (naive create/read/update), not in RAM.

Alternative (terminal/session only):

```bash
export GEMINI_API_KEY="your_key_here"
```

## Run
Before starting backend, start local MongoDB from repository root:

```bash
./dev.sh up
```

### Option A (from repository root)
Recommended in monorepo mode:

```bash
uvicorn backend.app.main:app --reload
```

### Option B (from `backend` directory)

```bash
uvicorn main:app --reload
```

Then open:
- API docs: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/health`

## Debug Via Swagger (`/docs`)
Use Swagger UI to verify the full job flow:

1. Open `http://127.0.0.1:8000/docs`.
2. Run `POST /api/v1/jobs/summarize` with body:

```json
{
	"url": "https://example.com"
}
```

Example real article request:

```bash
curl -X 'POST' \
	'http://localhost:8000/api/v1/jobs/summarize' \
	-H 'accept: application/json' \
	-H 'Content-Type: application/json' \
	-d '{
	"url": "https://techcrunch.com/2026/04/10/france-to-ditch-windows-for-linux-to-reduce-reliance-on-us-tech/"
}'
```

3. Copy the returned `job_id`.
4. Run `GET /api/v1/jobs/{job_id}` repeatedly until status is `completed` or `failed`.
5. On success, read structured output from `summary_data`.

For frontend list view (ready results), use:

```bash
curl -X 'GET' 'http://localhost:8000/api/v1/jobs'
```

Optional `limit` query param:

```bash
curl -X 'GET' 'http://localhost:8000/api/v1/jobs?limit=100'
```

`summary_data` contains `source_url` (the original link).

Expected statuses:
- `pending`: background task still running
- `completed`: summary generated successfully
- `failed`: scraping or generation failed

To stop local MongoDB:

```bash
./dev.sh down
```

## Module path
`No module named 'app'` means Python was started from a directory where `app` is not importable as a top-level module. Use one of the commands above to run with the correct module path.
