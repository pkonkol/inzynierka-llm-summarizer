---
paths:
  - "frontend/src/**/*.{ts,tsx}"
---

# Frontend rules (React / TypeScript)

## Parse, don't validate

Normalize and validate API responses once, at the fetch/hook layer. Presentational components trust their props completely — they do not re-check for null/undefined/empty.

## No silent fallbacks — FORBIDDEN patterns

- Props typed as `T | null | undefined` "just in case." If a component needs a value, require it — resolve nullability where the data enters the app, not in every consumer.
- Guard clauses that swallow a missing-data case instead of surfacing it.

```tsx
// BAD — every consumer of InfoRow has to defend against three empty states
interface InfoRowProps {
  value: string | number | boolean | null | undefined;
}
function InfoRow({ value }: InfoRowProps) {
  if (value === null || value === undefined || value === "") return null;
  ...
}

// GOOD — normalize once where the API response is parsed, component trusts the type
interface InfoRowProps {
  value: string | number | boolean;
}
function InfoRow({ value }: InfoRowProps) {
  return <span>{String(value)}</span>;
}
```

- `value ?? ""` / `value || ""` used to mask a value that should already be present — same ban as any other silent fallback.

Real example from this codebase (`EvaluationRunPage.tsx`, evaluation-run entry header): `source_meta` is a required `{url, title}` object per the backend Pydantic schema — every entry has it. It was typed as `Record<string, unknown>` on the frontend, forcing the component to defend against absence that could never happen:

```tsx
// BAD — defends against a shape that the API contract already guarantees
function EntryMetaLine({ sourceMeta }: { sourceMeta: Record<string, unknown> }) {
  const title = typeof sourceMeta.title === "string" ? sourceMeta.title : null;
  const url = typeof sourceMeta.url === "string" ? sourceMeta.url : null;
  const bits = [title, url].filter((v): v is string => Boolean(v));
  if (bits.length === 0) return null;
  return <p>{bits.join(" · ")}</p>;
}

// GOOD — type matches the backend contract (SourceMeta = {url: string, title: string}), no runtime guards
function EntryMetaLine({ sourceMeta }: { sourceMeta: SourceMeta }) {
  return <p>{sourceMeta.title} · {sourceMeta.url}</p>;
}
```

The fix wasn't in the component — it was giving `source_meta` a real type (`SourceMeta`) instead of `Record<string, unknown>`, and fixing the backend Pydantic model (`dict[str, Any]` → `SourceMeta` submodel) so the API boundary actually enforces the field is present. If a defensive check like this shows up, look upstream for a loose type first.

## Fail fast

A malformed or incomplete API response should throw where it's parsed, not degrade silently into a half-rendered UI. Don't add `try { } catch { /* ignore */ }` around fetches.

## Stack notes

- React + TypeScript, Vite, Tailwind.
- Keep components focused on rendering — no data validation logic mixed into JSX.

## Imports

React first, blank line, then local modules, `import type` last. Biome's
`organizeImports` enforces it — run `just fix-frontend` rather than sorting by hand.

## Logging

`loglevel`, re-exported from `src/utils/logger.ts`. Biome's `noConsole` blocks direct
`console.*` everywhere else.

- Same shape as the backend: a constant message plus named fields, never values
  interpolated into the string.
- `debug`/`info` are filtered out in production; `warn`/`error` stay.
- Level persists in localStorage, so `log.setLevel("debug")` in devtools raises verbosity
  on a deployed build without a rebuild.
- Never log a JWT, an `Authorization` header, or a raw API response body.

```tsx
// BAD
console.log(`failed to load job ${jobId}`);

// GOOD
logger.error("failed to load job", { jobId });
```

## Empty catch blocks

Still banned, as above. `catch { setError("...") }` is fine — the failure surfaces to the
user. `catch {}` and `.catch(() => "")` are not: they turn a failure into a silent wrong
answer.

## File layout

A helper with one caller lives next to that caller, not in its own module. Split only when
a second consumer appears.
