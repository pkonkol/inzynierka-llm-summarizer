# Frontend (React + Vite)

How to run, check and build the SPA. Recipes run from the repository root.

- `/` — public page: no login, rate-limited, three summary kinds and a density slider.
- `/admin/*` — research console: jobs, evaluation sets and runs; `/login` when auth is on.
- `/design` — design-system gallery, dev server only.

The split is explained in [ADR 0004](../docs/adr/0004-public-homepage-and-admin-split.md).

## Setup and run

```bash
just install-frontend                          # npm ci from the lockfile
cp frontend/.env.example frontend/.env         # VITE_API_URL, the backend base URL
just dev-frontend                              # http://127.0.0.1:5173
```

## Checks

```bash
just lint-frontend     # npm run lint (biome) + npm run typecheck (tsc -b)
just fix-frontend      # npm run lint:fix
just audit-frontend    # npm audit, fails on high
```

## API types

`src/types/api.generated.ts` is generated from `backend/openapi.json`. After a backend schema
change, from `frontend/`:

```bash
npm run generate-types
```

`just check-generated-types` (part of `just lint`) fails while the file is stale.

## Build

From `frontend/`:

```bash
npm run build      # tsc -b, then vite build into dist/
npm run preview    # serve dist/ locally
```

Production reads `.env.production`. A push to `master` builds and deploys `dist/` to Firebase
Hosting (`deploy.yaml`).
