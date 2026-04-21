# Phase 4 — TanStack Form

**Status:** not started
**Blocked by:** none in principle; can run in parallel with phases 2-3, but easier after phase 3 for consistent client/server state handling.

## Why

Current forms are a mix of raw `<form action={serverAction}>` + ad-hoc `useFormState`. TanStack Form gives typed, validated, composable forms with a first-class Next.js server-action integration.

## Scope

### Packages

- [ ] Install: `@tanstack/react-form`, `@tanstack/react-form-nextjs`.
- [ ] Keep `zod` as the validator (TanStack Form integrates via adapter).

### Shared helpers

- [ ] `lib/form.ts` — set up `createServerValidate(...)` and typed `useForm` helper to avoid repeating boilerplate.
- [ ] Decide on error display convention (field-level + top-level toast).

### Form list (port one by one)

- [ ] Smart-ID signin (`components/praamid-signin-flow.tsx`) — isikukood validation `^\d{11}$`.
- [ ] Trip create form — direction, measurement unit, notify/edit toggles, option set.
- [ ] Trip edit form — same fields.
- [ ] Options editor — stop-before-at datetime, priority list reorder.
- [ ] Settings — user-level preferences.
- [ ] Admin — poll interval, edit-globally toggle, role switch button (already a simple form, low-prio).
- [ ] Admin — trip delete confirm.

Each form = its own commit. Keep the existing API of the server action stable so we can port incrementally without breaking the rest of the UI.

## Risks / gotchas

- `@tanstack/react-form-nextjs` is newer — check for Next.js 16 compat explicitly (AGENTS.md: read `node_modules/next/dist/docs` for form-related changes).
- Server-side validation with `createServerValidate` must return errors in a shape `useTransform(mergeForm(...))` understands.

## Definition of done

- Every form listed above is on TanStack Form.
- Validation errors show inline and match server-side validation behavior.
- Typecheck + lint green.
