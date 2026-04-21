# Phase 4 — TanStack Form

**Status:** done (pending server verify)
**Blocked by:** none in principle; can run in parallel with phases 2-3, but easier after phase 3 for consistent client/server state handling.

## Why

Current forms are a mix of raw `<form action={serverAction}>` + ad-hoc `useFormState`. TanStack Form gives typed, validated, composable forms with a first-class Next.js server-action integration.

## Scope

### Packages

- [x] Installed: `@tanstack/react-form`, `@tanstack/react-form-nextjs`.
- [x] Keeping `zod` as the validator via Standard Schema (v4, no adapter needed).

### Shared helpers

- [x] `lib/schemas.ts` — shared zod schemas with translation-key error messages (e.g. `'topicMin'`). Server actions import + `safeParse`, client forms pass directly to `validators.onChange`.
- [x] `components/ui/field-error.tsx` — renders TanStack field errors; translates known keys via `useTranslations('Errors')` with a `t.has(...)` fallback.
- [x] Error convention: inline field errors via `<FieldError />`, plus sonner toast for server-level errors.
- [x] Not using `createServerValidate` + `useActionState` yet. All existing server actions return `{ ok, error }` and we call them from `onSubmit`. Upgrade path is open if we want progressive enhancement later.

### Form list (port one by one)

- [x] **Smart-ID signin** (`components/praamid-signin-flow.tsx`) — isikukood `^\d{11}$`. Uses TanStack Form on the input step; keeps existing fetch-based REST flow on submit (not a server action).
- [x] **Trip create** (`components/new-trip-form.tsx`) — direction enum, measurementUnit, notify/edit flags.
- [x] **Options editor (CutoffEditor)** inside `components/trip-card.tsx` — two fields (date, time) with a form-level cross-field validator that enforces `combined < eventStart`.
- [x] **User settings** (`components/settings-form.tsx`) — ntfyTopic.
- [x] **Admin poll interval** (`components/admin/poll-interval-form.tsx`) — numeric range 5000..600000.
- [x] **Trip card notify/edit toggles** — **intentionally NOT TanStack Form.** These are optimistic TanStack DB writes (`tripsCollection.update(...)`), not user-editable fields, and the UX benefit of form state is zero. Kept as-is.
- [x] **Admin edit-enabled toggle / role switch / admin trip delete / event-card add-option / trip-card remove/move/delete** — **intentionally NOT TanStack Form.** All are button-action patterns with fixed payloads (no user-editable fields). `<form action={...}>` or `onClick → action` is the right idiom here; TanStack Form would add ceremony without value.

Each form was ported in isolation; no cross-form coupling.

## Risks / gotchas resolved

- `z.coerce.number()` has input type `unknown`, which breaks Standard Schema type matching against TanStack Form field types. Split `pollIntervalSchema` (server FormData) from `pollIntervalNumberSchema` (client field value).
- zod v4 error messages embedded as translation keys; `FieldError` translates them at render time with `useTranslations('Errors').has()` fallback so a plain-text message still renders.
- `createServerValidate` + `useActionState` pattern is still on the table if we want progressive enhancement. Current client-side submit + server action is sufficient for our JS-always environment.

## Local verification

- [x] `bun run typecheck` — clean.
- [x] `bun run lint` — clean.

## Server verification

- [ ] Boot full stack, walk every ported form end-to-end (signin, settings, admin poll interval, trip create, cutoff editor).

## Definition of done

- [x] Every form with real user-editable fields is on TanStack Form with inline error rendering.
- [x] Button-action forms (toggles, deletes, reorder) documented as intentionally not ported.
- [x] Validation errors show inline and match server-side validation behavior.
- [x] Typecheck + lint green.
