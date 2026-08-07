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

## Fail fast

A malformed or incomplete API response should throw where it's parsed, not degrade silently into a half-rendered UI. Don't add `try { } catch { /* ignore */ }` around fetches.

## Stack notes

- React + TypeScript, Vite, Tailwind.
- Keep components focused on rendering — no data validation logic mixed into JSX.
