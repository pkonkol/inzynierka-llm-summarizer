# Single source of truth for every check in this repo. CI runs these exact recipes and
# contains no tool commands of its own, so local and CI cannot drift apart.
#
# Setup:  brew install just uv
# Usage:  just            (list recipes)
#         just lint       (everything)
#         just fix        (auto-fix what can be auto-fixed)

# Pinned so a local run and a CI run use the same binary.
ruff := "ruff@0.16.2"
pyrefly := "pyrefly@1.2.0"

# Container images, not installed binaries — the only way CI and this laptop are
# guaranteed to run the same version.
gitleaks := "zricethezav/gitleaks:v8.30.1"
hadolint := "hadolint/hadolint:v2.15.1-alpine"
trivy := "aquasec/trivy:0.73.0"
actionlint := "rhysd/actionlint:1.7.7"
zizmor := "ghcr.io/zizmorcore/zizmor:1.29.0"

# At or above this level fails a scan; below it is reported only (see report-* recipes).
gate := "HIGH,CRITICAL"

root := justfile_directory()

# List available recipes
default:
    @just --list --unsorted

# core.hooksPath is per-clone config, so it cannot be committed with the hook itself.

# One-time setup after a fresh clone: activate the repo's git hooks
[group('meta')]
setup-hooks:
    git config core.hooksPath .githooks
    @echo "pre-commit hook active: gitleaks on staged changes"

# Everything CI runs. Keep this as the single entry point.
[group('meta')]
ci: lint security

# Fast inner loop: no containers, no network. Run this constantly.
[group('meta')]
lint: lint-backend typecheck-backend lint-frontend test-backend

# Container-based scanners. Slower, needs Docker running.
[group('meta')]
security: scan-secrets scan-dockerfile scan-infra scan-deps audit-frontend lint-workflows

# Auto-fix formatting and the mechanical lint findings
[group('meta')]
fix: fix-frontend
    uvx {{ruff}} check --fix backend/
    uvx {{ruff}} format backend/

# Backend: ruff lint + format check
[group('backend')]
lint-backend:
    uvx {{ruff}} check backend/
    uvx {{ruff}} format --check backend/

# Backend: type check
[group('backend')]
[working-directory('backend')]
typecheck-backend:
    uvx {{pyrefly}} check

# Backend: does the app still import and wire up its routes?
[group('backend')]
smoke-backend:
    cd backend && ./venv/bin/python -c "from app.main import app; print(f'OK — {len(app.routes)} routes')"

# Backend: recompile requirements.txt from requirements.in
[group('backend')]
[working-directory('backend')]
deps-compile *args:
    uv pip compile requirements.in -o requirements.txt --universal --python-version 3.14 {{args}}
    uv pip compile requirements-dev.in -o requirements-dev.txt --universal --python-version 3.14 {{args}}

# Create backend/venv from scratch. Local dev already has one; CI does not.
[group('backend')]
[working-directory('backend')]
venv:
    uv venv --python 3.14 venv

# Run after deps-compile, so local dev matches the image (12-factor X).

# Backend: install both locks into ./venv
[group('backend')]
[working-directory('backend')]
deps-sync:
    uv pip install --python ./venv/bin/python -r requirements.txt
    uv pip install --python ./venv/bin/python -r requirements-dev.txt

# Backend: pytest
[group('backend')]
[working-directory('backend')]
test-backend:
    ./venv/bin/python -m pytest -q

# Frontend: lint + typecheck
[group('frontend')]
lint-frontend: lint-frontend-style typecheck-frontend

# `ci` not `install`: a stale lockfile should fail, not be silently rewritten.

# Frontend: install from the lockfile
[group('frontend')]
[working-directory('frontend')]
install-frontend:
    npm ci

# Frontend: biome — lint, format check and import order in one pass
[group('frontend')]
[working-directory('frontend')]
lint-frontend-style:
    npx biome check .

# Frontend: typecheck without emitting — faster feedback than a full build
[group('frontend')]
[working-directory('frontend')]
typecheck-frontend:
    # `-b` and not `--noEmit`: the root tsconfig is a solution file holding only `references`,
    # so a bare invocation type-checks nothing and always passes.
    npx tsc -b --noEmit

# Frontend: apply biome's formatting and safe fixes
[group('frontend')]
[working-directory('frontend')]
fix-frontend:
    npx biome check --write .

# Kept alongside trivy, not instead of it: trivy reported 0 on this same lockfile while
# npm audit found 5 highs in vite/postcss. Different advisory sources, different blind spots.

# Frontend: npm advisories for the dependency tree
[group('frontend')]
[working-directory('frontend')]
audit-frontend:
    npm audit --audit-level=high

# Removing a secret from the working tree does not un-burn it; the history still has it.

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

# --db-repository is explicit: trivy's default mirror intermittently 404s on the DB layer.

# CVEs in the locked dependency sets
[group('security')]
scan-deps:
    docker run --rm -v "{{root}}:/repo" {{trivy}} fs /repo --scanners vuln \
        --db-repository ghcr.io/aquasecurity/trivy-db:2 \
        --severity {{gate}} --exit-code 1 --quiet \
        --skip-dirs frontend/node_modules --skip-dirs backend/venv \
        --skip-dirs frontend/.firebase

# actionlint catches the workflow that dies eight minutes in; zizmor catches the one that
# runs fine and gets you owned. Gated at medium — these files hold the OIDC token.

# The CI pipeline checks itself: actionlint (correctness) + zizmor (security)
[group('security')]
lint-workflows:
    docker run --rm -v "{{root}}:/repo" -w /repo {{actionlint}} -color
    docker run --rm -v "{{root}}:/repo" -w /repo {{zizmor}} --no-progress \
        --min-severity=medium .github/workflows/

# Separate from scan-deps because an image also carries the base OS and whatever it
# ships. Not in `just security`: it needs an image to exist first.

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
