# Single source of truth for every check in this repo.
#
# CI runs these exact recipes — .github/workflows/ contains no tool commands of its
# own, only `just <recipe>`. That is deliberate: there is one place to change a flag,
# so local and CI cannot drift apart.
#
# Setup:  brew install just uv
# Usage:  just            (list recipes)
#         just lint       (everything)
#         just fix        (auto-fix what can be auto-fixed)

# Pinned so a local run and a CI run use the same binary.
ruff := "ruff@0.16.2"

# Scanners run as pinned container images rather than installed binaries: it is the
# only way to guarantee the CI runner and this laptop execute identical versions.
gitleaks := "zricethezav/gitleaks:v8.30.1"
hadolint := "hadolint/hadolint:v2.15.1-alpine"
trivy := "aquasec/trivy:0.73.0"
actionlint := "rhysd/actionlint:1.7.7"
zizmor := "ghcr.io/zizmorcore/zizmor:1.29.0"

# Findings at or above this level fail a scan. Everything below is reported, not gated —
# see `just report-infra` for the full picture.
gate := "HIGH,CRITICAL"

root := justfile_directory()

# List available recipes
default:
    @just --list --unsorted

# Everything CI runs. Keep this as the single entry point.
[group('meta')]
ci: lint security

# Fast inner loop: no containers, no network. Run this constantly.
[group('meta')]
lint: lint-backend lint-frontend

# Container-based scanners. Slower, needs Docker running.
[group('meta')]
security: scan-secrets scan-dockerfile scan-infra scan-deps lint-workflows

# Auto-fix formatting and the mechanical lint findings
[group('meta')]
fix:
    uvx {{ruff}} check --fix backend/
    uvx {{ruff}} format backend/

# Backend: ruff lint + format check
[group('backend')]
lint-backend:
    uvx {{ruff}} check backend/
    uvx {{ruff}} format --check backend/

# Backend: does the app still import and wire up its routes?
[group('backend')]
smoke-backend:
    cd backend && ./venv/bin/python -c "from app.main import app; print(f'OK — {len(app.routes)} routes')"

# Backend: recompile requirements.txt from requirements.in
[group('backend')]
[working-directory('backend')]
deps-compile *args:
    uv pip compile requirements.in -o requirements.txt --universal --python-version 3.14 {{args}}

# Long-form: local dev must run the same versions the image builds (12-factor X,
# dev/prod parity). Run this after deps-compile.

# Backend: install the lock into ./venv
[group('backend')]
[working-directory('backend')]
deps-sync:
    uv pip install --python ./venv/bin/python -r requirements.txt

# Frontend: lint + typecheck
[group('frontend')]
lint-frontend: lint-frontend-style typecheck-frontend

# Here rather than inline in CI so the flag stays in one place. `ci` not `install`, so a
# stale lockfile fails the build instead of being silently rewritten.

# Frontend: install from the lockfile
[group('frontend')]
[working-directory('frontend')]
install-frontend:
    npm ci

# Frontend: lint only, no typecheck
[group('frontend')]
[working-directory('frontend')]
lint-frontend-style:
    npm run lint

# Frontend: typecheck without emitting — faster feedback than a full build
[group('frontend')]
[working-directory('frontend')]
typecheck-frontend:
    npx tsc --noEmit

# A secret that was committed and later removed is still in the history, and still burned.

# Secrets across the whole git history
[group('security')]
scan-secrets:
    docker run --rm -v "{{root}}:/repo" {{gitleaks}} detect --source=/repo --redact --no-banner

# Secrets in staged changes only — fast enough for a pre-commit hook (~50ms).
[group('security')]
scan-secrets-staged:
    docker run --rm -v "{{root}}:/repo" -w /repo {{gitleaks}} protect --staged --redact --no-banner

# Dockerfile: hadolint (best practices) + trivy (misconfiguration)
[group('security')]
scan-dockerfile:
    docker run --rm -i {{hadolint}} hadolint - < backend/Dockerfile
    docker run --rm -v "{{root}}:/repo" {{trivy}} config /repo/backend/Dockerfile \
        --severity {{gate}} --exit-code 1 --quiet

# Terraform and compose misconfiguration
[group('security')]
scan-infra:
    docker run --rm -v "{{root}}:/repo" {{trivy}} config /repo/infra \
        --severity {{gate}} --exit-code 1 --quiet

# --db-repository is explicit because trivy's default mirror (mirror.gcr.io) intermittently

# CVEs in the locked dependency sets
[group('security')]
scan-deps:
    docker run --rm -v "{{root}}:/repo" {{trivy}} fs /repo --scanners vuln \
        --db-repository ghcr.io/aquasecurity/trivy-db:2 \
        --severity {{gate}} --exit-code 1 --quiet \
        --skip-dirs frontend/node_modules --skip-dirs backend/venv \
        --skip-dirs frontend/.firebase

# The CI pipeline checks itself. Two tools, two different failure modes:
#   actionlint — correctness: bad expressions, wrong action inputs, shellcheck on `run:`.
#                Catches the workflow that dies eight minutes in.
#   zizmor     — security: template injection, credential leakage, cache poisoning.
#                Catches the workflow that runs fine and gets you owned.
#
# Gated at `medium`: the workflow surface is three files that hold the OIDC token, so it
# is worth being stricter here than on application dependencies. `just report-workflows`
# shows everything below the gate.

# The CI pipeline checks itself: actionlint (correctness) + zizmor (security)
[group('security')]
lint-workflows:
    docker run --rm -v "{{root}}:/repo" -w /repo {{actionlint}} -color
    docker run --rm -v "{{root}}:/repo" -w /repo {{zizmor}} --no-progress \
        --min-severity=medium .github/workflows/

# CVEs in a BUILT image. Deliberately separate from `scan-deps`, which reads the
# lockfiles: an image also contains the base OS and whatever the base image ships, so the
# two scans genuinely find different things. Not part of `just security` because it needs
# an image to exist first — CI runs it after the build, before the push.

# CVEs in a built image (base OS included, unlike scan-deps)
[group('security')]
scan-image image="inzynierka-backend:local":
    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock {{trivy}} image {{image}} \
        --db-repository ghcr.io/aquasecurity/trivy-db:2 \
        --severity {{gate}} --exit-code 1 --quiet

# Build the backend image locally under the name scan-image expects
[group('backend')]
build-backend:
    docker build -t inzynierka-backend:local ./backend

# Full misconfiguration report at every severity — what the gate deliberately lets past
[group('security')]
report-infra:
    docker run --rm -v "{{root}}:/repo" {{trivy}} config /repo/infra /repo/backend/Dockerfile --quiet

# Every workflow finding, including the ones below the gate
[group('security')]
report-workflows:
    docker run --rm -v "{{root}}:/repo" -w /repo {{zizmor}} --no-progress \
        --min-severity=informational .github/workflows/ || true
