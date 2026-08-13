# 0001. Static analysis and CI/CD toolchain

**Status:** Accepted
**Date:** 2026-08-12

## Context and Problem Statement

The repository had no static analysis: no Python linter, no `pyproject.toml` to put one in,
no CI workflow at all beyond a deploy that fired on push to `master`. The one ESLint config
present was the unmodified Vite scaffold and was never executed. Four `CLAUDE.md` files
documented real conventions — parse-don't-validate, no silent fallbacks — that nothing
enforced.

Two goals, and they pull in different directions. The practical one is catching defects
before they ship. The other is learning the 2026 DevSecOps ecosystem well enough to discuss
it in interviews, which argues for breadth — including tools that are not worth adopting
here, provided the reason for rejecting them is recorded.

The repository is **private**, which removes a large part of the free tooling: CodeQL,
GitHub secret scanning with push protection, and the free tiers of SonarQube Cloud and
similar services are public-repository-only. It is also solo, with work landing on `master`
by manual squash merge rather than through pull requests.

## Decision Drivers

* Cost — free or a few PLN/month; the repository being private rules out several free tiers
* One source of truth — local and CI must not be able to drift apart
* Signal over coverage — a tool that produces noise gets disabled within a fortnight
* Comprehensibility — every tool has to be explainable, which rules out meta-linters
* Fit with a solo workflow — no ceremony that only pays off with a second contributor

## Considered Options

* Python: **ruff** · pylint · flake8 + isort + black + bandit
* Type checking: mypy · **pyright** · ty
* TypeScript: **Biome** · ESLint + Prettier · oxlint
* Security: **Trivy + hadolint + Checkov** · osv-scanner · Snyk · CodeQL · SonarQube Cloud
* Secrets: **gitleaks** · TruffleHog · GitHub Secret Protection
* Runner: **just** · make · plain shell scripts · pre-commit
* Gating: **status checks with no branch protection** · rulesets · required PRs

## Decision Outcome

**ruff** (lint, format, and the `S` security rules) for Python; **Biome** replacing ESLint
and Prettier for TypeScript; **Trivy, hadolint and gitleaks** for images, IaC and secrets;
**actionlint and zizmor** for the workflows themselves; **`just`** as the single entry
point, with GitHub Actions containing no tool commands of its own.

The anti-drift property is the load-bearing part. Every workflow step is `run: just
<recipe>`, so there is exactly one place a flag can change. Scanners run as pinned
container images rather than installed binaries, so CI and a laptop execute the same
version rather than whatever each happened to install.

Type checking is deferred: the codebase already carries 16 `# pyright: ignore` suppressions
for genuine gaps in deepeval's and langchain's type information, which means adopting mypy
would produce a second, parallel set of suppressions in the same 16 places. Pyright is the
better fit precisely because the editor already reports it, but that is a separate decision.

### Consequences

* Good — the first run found real defects, not just style: three `asyncio.create_task`
  calls with no strong reference (metrics could vanish silently), five HIGH CVEs in nltk
  including a DNS-rebinding SSRF bypass, two more CVEs visible only when scanning the built
  image, and 20 high-severity workflow findings.
* Good — `just ci` runs everything in about 20 seconds; the fast subset in under two.
* Good — the rejections are recorded, which is more defensible than an unexplained stack.
* **Bad** — five tools each need a version bump eventually, and nothing automates that yet;
  Dependabot for the `github-actions` ecosystem is deliberately still outstanding.
* **Bad** — `just` has to be installed, unlike make. One CI step, one `brew install`.
* **Bad** — no branch protection means a red pipeline does not physically stop a merge. It
  relies on the author reading the result.
* **Bad** — Biome does not fully cover `rules-of-hooks`, and its CSS parser does not
  understand Tailwind 4's at-rules, so CSS is excluded from linting entirely.
* Neutral — roughly 250 files were reformatted mechanically on adoption.

## Pros and Cons of the Options

### ruff over the flake8 stack

* `+` One binary replaces flake8, isort, pyupgrade, bandit and black; near-instant
* `+` `S` gives Bandit's rules with no separate tool or config
* `−` Fewer cross-module checks than pylint — accepted; pylint is slow and noisy

### Biome over ESLint + Prettier

* `+` Replaces both, plus import sorting, with one binary and one config file
* `+` An LSP server, so the same config drives VS Code and Neovim
* `+` Fixed the actual Prettier complaint: there was no Prettier config and no
  `editor.defaultFormatter`, so the editor was guessing
* `−` `rules-of-hooks` coverage is weaker than `eslint-plugin-react-hooks`
* `−` No Tailwind 4 CSS support, so CSS is out of scope
* `−` Stricter on `useExhaustiveDependencies`: 10 warnings where ESLint reported 2

### Trivy over osv-scanner

* `+` One binary covers dependency CVEs, image CVEs and IaC misconfiguration
* `+` Already the tool the author uses professionally
* `−` Its npm advisory data is weaker: it reported 0 on a `package-lock.json` where
  `npm audit` found five highs. Both are therefore kept.

### Rejected: CodeQL

* `+` Best open-source semantic SAST engine, with real dataflow analysis
* `−` Free only for public repositories; private costs $30/committer/month
* `−` On a private repository the Code Scanning UI does not exist, so SARIF has nowhere to
  render — findings would have to be surfaced through the step summary anyway
* Substitute: Semgrep OSS, which also has taint mode and covers most of the same cases

### Rejected: branch protection

* `+` Would make a red pipeline physically block a merge
* `−` A ruleset requiring status checks effectively requires pull requests, because on a
  direct push the checks have not run yet. That breaks a solo `git merge --squash work`
  workflow for a benefit one person does not need
* Revisit when a second person joins, or as a ruleset with an admin bypass

### Rejected: pre-commit as a framework

* `+` Isolated per-hook environments, pinned revisions, and the same config runs in CI
* `−` The runner already provides that anti-drift property
* `−` One slow hook leads to `--no-verify`, and then no hook runs at all
* Kept: a single `pre-commit` hook running `gitleaks protect --staged` (~50 ms), because a
  leaked secret is the only item on this list that cannot be undone after a push

### Rejected: `ty` (Astral)

* `+` Rust, 10–100× faster than mypy, same ecosystem as ruff
* `−` Version 0.0.70 in August 2026, and it checks unannotated function bodies by default,
  so it reports *more* on a first run than mypy does
* Revisit at 1.0

### Rejected: MegaLinter, oxlint, dependency cooldown, Infracost, OPA/Conftest

MegaLinter is slow and opaque, which defeats the learning goal. oxlint's speed advantage is
worth nothing across 2,900 lines. Cooldown periods are meaningless without an update bot.
Infracost reports ≈$0 for a scale-to-zero Cloud Run service. A policy engine is
disproportionate to 267 lines of Terraform.

## Confirmation

`just ci` runs the full set. The anti-drift property is checkable directly: every tool
invocation in `.github/workflows/` is a `just` recipe, so `grep -c 'run: just'` should
account for every non-setup step.
