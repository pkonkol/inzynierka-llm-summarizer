# Frontend Web (Parallel Implementation)

This is the custom React SPA implementation built in parallel to the reference design folder.

Reference-only folder (not modified):
- `frontend/MVP Frontend for Summaries/`

Implemented app folder:
- `frontend/web/`

## Features

- Central rounded URL submit card
- Live polling for just-created jobs
- Dynamic list of completed jobs
- Right-side detail panel inspired by Deep Research layout
- Mobile-responsive panel behavior

## Backend API Used

- `POST /api/v1/jobs/summarize`
- `GET /api/v1/jobs`
- `GET /api/v1/jobs/{job_id}`

## Run

From `frontend/web`:

```bash
npm install
cp .env.example .env
npm run dev
```

Default app URL:
- `http://127.0.0.1:5173`

Build:

```bash
npm run build
```
