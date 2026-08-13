---
paths:
  - "infra/**/*.tf"
  - "infra/**/*.yml"
  - "**/Dockerfile"
  - ".github/workflows/*.yml"
  - "justfile"
---

# Infra rules (Terraform / Docker Compose / Firebase)

## No silent fallbacks — FORBIDDEN patterns

- Default values in `.tfvars`/env config that mask a genuinely required setting (e.g. `variable "api_key" { default = "" }`). If a deploy needs it, missing it should fail the plan/apply, not silently deploy with an empty value.
- Config that swallows a missing environment variable and substitutes a hardcoded default in application startup code — same fail-fast rule as backend/frontend.

## Fail fast

Missing required config (secrets, connection strings, project IDs) should error out immediately at plan/build/startup time with a clear message, not degrade into a broken runtime state discovered later.

## Secrets

Never write real secrets/API keys into `.tfvars`, `docker-compose.yml`, or any committed file. Reference them via environment variables or a secrets manager.

## Tooling

Every check has a `just` recipe, and CI runs those recipes and nothing else. If you add a
check, add it to the `justfile` — never inline a tool command into a workflow, or local and
CI start drifting apart immediately.

Scanners run as pinned container images so CI and a laptop execute the same version.

## Dockerfile

- No package manager in the runtime image; the builder stage installs everything.
- `USER` numeric, not a name (hadolint DL3066).
- Base image pinned by tag; `.dockerignore` excludes `.env*`, venvs and caches.

## Workflows

- `permissions` per job, never workflow-wide — `id-token: write` mints a GCP token.
- `actions/checkout` with `persist-credentials: false` unless the job pushes.
- Never interpolate `${{ }}` into a `run:` block; pass it through `env:` so the shell sees
  a variable instead of code it can re-parse.
- Anything deployed gets a smoke test and a rollback path.
