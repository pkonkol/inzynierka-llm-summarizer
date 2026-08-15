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

## Spacing

Requirement levels are RFC 2119: **MUST** is a review blocker, **SHOULD** needs a reason in
the reply, **MAY** is free choice.

### Who owns the space — MUST

The parent owns the space *between* children, the child owns the space *inside itself*.

- A container with more than one child **MUST** set `grid gap-*` (or `flex gap-*`) instead of
  letting children space themselves.
- A child **MUST NOT** set an outer margin (`mt-*`, `mb-*`, `ml-*`, `mr-*`) to position itself
  in its parent. Padding on itself is fine; margin is not.
- A component **MUST NOT** carry a margin that only makes sense at one call site — that
  spacing belongs to the caller's `gap`.

Why: with `gap`, adding, reordering or conditionally hiding a child cannot leave a double or
missing space, because no child knows about its siblings. With margins it always can.

```tsx
// BAD — the list positions itself, and hiding <Alert> leaves a hole
<section>
  <Alert className="mt-4">{flash}</Alert>
  <JobsList className="mt-6" />
</section>

// GOOD — one number, in one place, and every child is position-agnostic
<section className="grid gap-6">
  <Alert>{flash}</Alert>
  <JobsList />
</section>
```

`space-y-*` is `gap` implemented as margins on the children; use `grid gap-*` instead.

Inline spacing inside a line of text (`ml-2` on a status glyph after a label) is not layout
and is exempt.

### Which numbers — SHOULD

`--spacing` is `0.25rem`, so every step is `N × 4px`. Eight steps cover the whole UI:

| range | steps | px | for |
|---|---|---|---|
| micro | `1`, `2` | 4, 8 | label–value, icon–text |
| base | `3`, `4`, `6` | 12, 16, 24 | ~90% of cases |
| macro | `8`, `12`, `16` | 32, 48, 64 | between sections |

- Spacing utilities **SHOULD** use one of these steps. `5` (20px) is deliberately absent —
  it is the step people pick when hesitating between 16 and 24.
- Half steps (`2.5`, `3.5`) and off-scale values (`4.5`, `5.5`) **SHOULD NOT** be used.
- Arbitrary values (`min-h-[320px]`, `max-w-355`) **MUST NOT** be used for a value that a
  scale step already expresses (`min-h-80` is the same 320px). A genuine design decision
  **MUST** become a token in `@theme` (`--container-app`) or a named constant next to the
  component (`SPLIT_COLUMNS` in `ui/PageShell.tsx`).

### Sizing above the spacing ceiling — MUST

The spacing scale stops at 64px. Anything larger is a layout decision, not a step, and
**MUST** be a named token in `@theme` rather than a number at the call site:

- `--container-*` for widths — `--container-app`, `--container-measure`, `--container-list`,
  `--container-detail`. These generate `max-w-app`, `w-detail`, and can be referenced inside
  an arbitrary value as `minmax(var(--container-list),38%)`.
- `--spacing-*` for a named component size — `--spacing-control` (44px) gives `h-control`,
  which every input, select and full-height button uses so a row of them lines up.

Viewport-relative values (`h-[75vh]`, `calc(100vh-2rem)`) are not scale values and stay
arbitrary. A repeated arbitrary value **SHOULD** become a token on its second use.

### Do not restate Preflight — FORBIDDEN

Tailwind's Preflight already sets `margin: 0`, `padding: 0` and `border: 0` on **every**
element, and `list-style: none` on `ul`/`ol`/`menu`. So `m-0`, `p-0` and `list-none` are
always dead weight. Check Preflight before adding a reset utility.

## Accessibility

The bar: the author and their supervisor must never have to guess where to click, and the
whole app must work from the keyboard.

- Focus **MUST** stay visible. `outline-none` without a replacement is forbidden; the global
  `:focus-visible` rule in `index.css` covers everything, so components need no focus styling
  of their own.
- State **MUST NOT** be carried by colour alone (WCAG 1.4.1). A status needs its text label
  or a glyph next to the colour; decorative glyphs get `aria-hidden="true"` so they are not
  read aloud.
- Anything that navigates **MUST** be an `<a href>`, not a `<button>` with an `onClick` —
  otherwise the middle click, "open in new tab" and "copy link" all silently do nothing. Use
  `ui/LinkButton.tsx`, which keeps client-side routing for plain clicks and lets every
  modifier click through to the browser.
- A toggle that shows or hides content **MUST** carry `aria-expanded` (`ui/DisclosureButton.tsx`).
- A dialog **MUST** have `role="dialog"`, `aria-modal`, a label via `aria-labelledby`, close on
  Escape and on a backdrop click, and **MUST** return focus to whatever opened it. `ui/Modal.tsx`
  does all of it; do not hand-roll another overlay.
- Text that appears in response to a background job **SHOULD** sit inside an always-mounted
  `aria-live="polite"` container. A live region only announces what is inserted *after* it
  exists, so conditionally rendering the region itself announces nothing.

## Feedback: event or state

Two different things, two different components. Getting this wrong is what makes a page jump
under the reader's eyes.

- A **transient event** — "job created", "run finished", "delete failed" — **MUST** go through
  `useFlashMessage` + `ui/Toast.tsx`. It is `fixed` in the corner, so it never moves the
  content the reader is looking at.
- **Page state** — "no results", "could not load this run", "run in progress" — **MUST** stay
  in the document flow as `ui/Alert.tsx`. It describes what is on screen, so it belongs on
  screen.

Two rules on top of that:

- A failure **MUST NOT** auto-dismiss. `useFlashMessage` runs its timer only for the success
  tone; an error explaining why a job died is useless if it vanishes before it is read.
- A long technical message **MUST NOT** be dumped into the notification whole. `Toast` shows
  the first sentence and hides the rest behind `Collapsible`. Provider errors arrive as a
  serialised object several hundred characters long (`evaluation_runner.py` stores `str(exc)`).

## API errors

`request()` in `api/client.ts` unwraps FastAPI's `{"detail": "..."}` before throwing, so the
raw response body never reaches the interface. Components **MUST** render the result with
`errorText(error)` and never with `String(error)` — the latter puts
`Error: {"detail":"Not Found"}` on screen. User-facing copy is Polish, in the form
`Nie udało się <co>: <errorText>`.

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
