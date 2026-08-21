# Static analysis

What runs, where, and what each tool is actually for. The reasoning behind the choices —
including the tools deliberately not used — is in
[ADR-0001](adr/0001-static-analysis-and-cicd-toolchain.md).

## Running it

`just` is the single entry point. GitHub Actions contains no tool commands of its own; every
step is `run: just <recipe>`, so a flag has exactly one place to change.

```
just              # list recipes
just lint         # ruff, biome, tsc, pytest — ~2s, no containers
just fix          # formatting and safe fixes
just security     # gitleaks, trivy, hadolint, actionlint, zizmor — needs Docker
just ci           # everything CI runs, ~20s
```

Scanners run as **pinned container images** rather than installed binaries. That is the only
way a CI runner and a laptop are guaranteed to execute the same version.

## Where each check runs

| Layer | What | Blocking |
|---|---|---|
| Editor (LSP) | ruff, biome, tsserver | no |
| `pre-commit` hook | `gitleaks protect --staged` only, ~50 ms | yes |
| Manual | `just lint`, `just fix` | no |
| CI, any branch push | `just ci` | no, but visible |
| CI, push to `master` | `just ci` + build + image scan + deploy + smoke test | yes — deploy is gated |

Only one git hook exists, on purpose. A leaked secret is the single item on this list that
cannot be undone after a push; everything else is caught a minute later by CI. One slow hook
is all it takes for `--no-verify` to become habit, and then no hook runs at all.

## The tools

| Tool | Category | Catches |
|---|---|---|
| **ruff** | lint + format | Python style, bugs, unsorted imports, `print()`, and Bandit's security rules via `S` |
| **Biome** | lint + format | TypeScript/JSX/JSON, React hook rules, import order. Replaces ESLint and Prettier |
| **tsc** | types | TypeScript in `strict` mode, as a separate step from the build |
| **pyrefly** | types | Python types. `basic` preset, enforced at 0 errors: CI fails the build if any remain |
| **pytest** | tests | currently the scraper's SSRF guard |
| **gitleaks** | secrets | secrets across the whole git history, including already-committed and removed files |
| **Trivy** | SCA + IaC + image | dependency CVEs, Terraform misconfiguration, CVEs in a built image |
| **hadolint** | lint | Dockerfile practices — missing `USER`, unpinned installs |
| **npm audit** | SCA | npm advisories. Kept alongside Trivy, see below |
| **actionlint** | lint | workflow correctness: expressions, action inputs, shellcheck on `run:` |
| **zizmor** | security | workflow security: template injection, credential leakage, cache poisoning |

### Why some of these overlap on purpose

**`trivy fs` and `npm audit`** read the same `package-lock.json` and disagree. Trivy reported
zero while npm audit found five high-severity advisories in vite and postcss. Different
advisory databases have different blind spots, so both run.

**`trivy fs` and `trivy image`** are not the same scan. The first reads lockfiles, the second
reads what is actually inside the image — the base OS, and anything the base image ships.
The image scan found two CVEs the lockfile scan could not see.

**actionlint and zizmor** cover different failure modes entirely: actionlint catches the
workflow that dies eight minutes in, zizmor catches the one that runs fine and gets you
owned.

## Gates

Trivy and the image scan fail on `HIGH,CRITICAL`. pyrefly gates on its `basic` preset, with
the reasoning recorded next to the setting in `backend/pyproject.toml`. zizmor fails on
`medium`, because the workflow surface is three files that hold the OIDC token and is worth
being stricter about.
Everything below a gate is reported rather than dropped — `just report-infra` and
`just report-workflows` show the full picture.

On a private repository there is no Code Scanning tab to upload SARIF to, so CI writes the
below-gate findings to `$GITHUB_STEP_SUMMARY` instead. That is the free equivalent, and it
is worth knowing the difference between a *tool* and the *platform that aggregates its
output*.

## The wider ecosystem

Categories worth being able to name, with the tool used here in bold:

1. **Formatting** — ruff format, **Biome**, `terraform fmt`
2. **Linting** — **ruff**, **Biome**, oxlint, tflint, **hadolint**
3. **Type checking** — **pyrefly**, mypy, pyright, ty, **tsc**
4. **SAST** — Semgrep, CodeQL, Bandit (**as ruff `S`**), SonarQube
5. **SCA** — **Trivy**, **npm audit**, pip-audit, osv-scanner, Dependabot
6. **Secret scanning** — **gitleaks**, TruffleHog, GitHub Push Protection
7. **IaC scanning** — **Trivy config**, Checkov, tflint, KICS
8. **Container scanning** — **Trivy image**, Grype, GCP Artifact Analysis
9. **Supply chain** — SBOM, SLSA provenance, cosign, SHA pinning, dependency cooldowns
10. **Complexity / dead code** — radon, knip, ts-prune, madge
11. **Coverage / mutation** — **pytest**, mutmut, Stryker
12. **CI/workflow linting** — **actionlint**, **zizmor**
13. **Policy as code** — OPA/Rego, Conftest
14. **AI review** — Claude Code Action, CodeRabbit, Greptile
15. **DAST / fuzzing** — OWASP ZAP, Schemathesis, Nuclei
16. **Cloud posture** — GCP Security Command Center, Binary Authorization

The distinction people get wrong most often: **SCA** in industry means Software Composition
Analysis — dependency CVEs only. Static analysis of your own code is **SAST**. They are
different tools answering different questions.

## Standards this follows

12-Factor App — II (explicit dependencies: `requirements.in` → locked `requirements.txt`),
III (config in the environment), XI (logs as an event stream to stdout). Conventional
Commits 1.0.0. MADR for the decision records. OWASP Top 10 A10 and API Security API7 for
the SSRF work. CIS Docker Benchmark for the non-root container.
