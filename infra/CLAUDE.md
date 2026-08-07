# Infra rules (Terraform / Docker Compose / Firebase)

## No silent fallbacks — FORBIDDEN patterns

- Default values in `.tfvars`/env config that mask a genuinely required setting (e.g. `variable "api_key" { default = "" }`). If a deploy needs it, missing it should fail the plan/apply, not silently deploy with an empty value.
- Config that swallows a missing environment variable and substitutes a hardcoded default in application startup code — same fail-fast rule as backend/frontend.

## Fail fast

Missing required config (secrets, connection strings, project IDs) should error out immediately at plan/build/startup time with a clear message, not degrade into a broken runtime state discovered later.

## Secrets

Never write real secrets/API keys into `.tfvars`, `docker-compose.yml`, or any committed file. Reference them via environment variables or a secrets manager.
