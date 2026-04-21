# Phase 3 — TanStack DB collections

**Status:** done (pending server verify)
**Blocked by:** phase 2 ✓
**Blocks:** phase 5

## Why

TanStack DB sits between collections (sync sources) and the UI (`useLiveQuery`). This is what replaces server-component `await db.select(...)` with reactive client-side queries that stay in sync without refresh.

## Scope

### Packages

- [x] Installed: `@tanstack/db`, `@tanstack/react-db`, `@tanstack/electric-db-collection`, `@tanstack/react-query`, `@tanstack/query-db-collection`.
- [x] Decision: keep server actions for mutations. React Query is in the tree only because `query-db-collection` pulls it in; we're not using it directly yet.

### Collections

`lib/collections.ts` defines Electric-backed collections pointing at `/api/shape`:

- [x] `tripsCollection` — user-scoped via gateway. Now has `onUpdate` handler that calls `updateTrip` server action and uses `awaitMatch` to reconcile the optimistic state with the Electric stream.
- [x] `tripOptionsCollection` — user-scoped (requires `user_id` denorm from phase 2).
- [x] `ticketsCollection` — user-scoped.
- [ ] `praamidCredentialsCollection` — **intentionally deferred**. Row includes `access_token_enc`; expose only after adding a `columns` whitelist to the shape (see note in `lib/collections.ts`).
- [x] `settingsCollection` — admin dashboard reads pollIntervalMs + editGloballyEnabled live.
- [x] `usersCollection` — admin-only; feeds admin users table.
- [x] `auditLogsCollection` — admin-only; defined but not consumed yet (future use).
- [x] `adminTripsCollection` / `adminTripOptionsCollection` — admin-scoped views opt into unfiltered rows via `?scope=admin` (gateway enforces `role=admin`).

### Providers

- [x] `components/app-providers.tsx` (client) wraps children in `QueryClientProvider` using the shared `queryClient` from `lib/collections.ts`.
- [x] Mounted inside `app/[locale]/(app)/layout.tsx` so only the authed area pays the cost.

### Page rewrites

- [x] `/[locale]/(app)/` home page reads `trips + trip_options + tickets` from Electric via `useLiveQuery`. Card data is projected from the snake_case shape rows into the camelCase shape `TripCard` already expects.
- [x] `/[locale]/(app)/admin` — server shell (requireAdmin only) wraps `<AdminDashboard />` client component. Users, trips, and settings all read live from admin-scoped collections. `subCount` (trip count per user) and "first option per trip" (by priority) computed client-side.
- [ ] `/[locale]/(app)/trips/[id]/options` — **deferred intentionally**. Form-driven page that reads praamid event listings via server-only `listEvents`; port has no reactivity value.
- [ ] `/[locale]/(app)/settings` — **deferred intentionally**. Reads credential status server-side; porting adds a `columns` whitelist complication (encrypted token column) for marginal benefit.

### Mutations

- [x] Optimistic write pattern established for the notify/edit toggles. `tripsCollection.update(id, draft => {...})` applies locally, `onUpdate` on the collection calls `updateTrip` server action, then `awaitMatch` waits for Electric to stream the row back — reconciling the optimistic state. Other mutations (move, remove option, delete trip, settings forms, admin role/delete) still call server actions directly; the UI updates when Electric streams the change, which is sufficient for non-toggle writes.

## Risks / gotchas

- Electric shape rows are snake_case (raw Postgres column names). Code that consumed the Drizzle camelCase shape has to project between them — keep the mapping at the collection boundary rather than leaking snake_case into components.
- `praamid_credentials` row carries an encrypted access token. Don't expose the full row over Electric without whitelisting columns in the shape request.
- `useLiveQuery` returns an empty array while the collection is still syncing; the home page treats empty as "no trips yet" — this is visually indistinguishable from loading. Acceptable for 2-user hobby; revisit when adding a first-load spinner.

## Local verification (done here)

- `bun run typecheck` — clean.
- `bun run lint` — clean.

## Server verification

- Boot full stack (`docker compose up`), sign in, confirm home page loads trips without a page refresh after inserting a trip in another tab.
- Confirm that cross-user data does not leak — open DevTools network tab, inspect `/api/shape?table=trips` response, should only contain rows owned by the session user.

## Carry-overs (deferred to a later phase)

1. `praamidCredentialsCollection` + `/settings` port — requires `columns` whitelist on the shape so the encrypted access token never reaches the client. Low value (single-page, rarely visited).
2. `/trips/[id]/options` port — blocked on `listEvents` being callable from the client (it wraps the praamid API server-side). Not worth porting without that.
3. Richer optimistic patterns for the remaining mutations (option reorder, ticket slot, admin actions). Current "call server + wait for Electric stream" is acceptable.

## Definition of done

- [x] Foundation (packages, providers, collections, home page) green on local checks.
- [x] Home + admin ported. Settings and trips/[id]/options deferred intentionally (see carry-overs).
- [x] Optimistic mutations pattern established on the notify/edit toggle.
- [ ] Two-tab live-sync smoke test on server.
