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
