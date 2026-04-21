# Phase 3 — TanStack DB collections

**Status:** in progress (foundation landed; remaining pages + mutations deferred)
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

- [x] `tripsCollection` — user-scoped via gateway.
- [x] `tripOptionsCollection` — user-scoped (requires `user_id` denorm from phase 2).
- [x] `ticketsCollection` — user-scoped.
- [ ] `praamidCredentialsCollection` — **intentionally deferred**. Row includes `access_token_enc`; expose only after adding a `columns` whitelist to the shape (see note in `lib/collections.ts`).
- [ ] `settingsCollection` — not needed yet; only admin page reads it.
- [ ] `usersCollection` — admin-only, not needed until admin page is ported.
- [ ] `auditLogsCollection` — admin-only, not needed yet.

### Providers

- [x] `components/app-providers.tsx` (client) wraps children in `QueryClientProvider` using the shared `queryClient` from `lib/collections.ts`.
- [x] Mounted inside `app/[locale]/(app)/layout.tsx` so only the authed area pays the cost.

### Page rewrites

- [x] `/[locale]/(app)/` home page reads `trips + trip_options + tickets` from Electric via `useLiveQuery`. Card data is projected from the snake_case shape rows into the camelCase shape `TripCard` already expects.
- [ ] `/[locale]/(app)/trips/[id]/options` — still server-component fetch. Also reads praamid event listings via `listEvents` which is server-only; port deferred.
- [ ] `/[locale]/(app)/settings` — still server-component (reads credential status). Port deferred.
- [ ] `/[locale]/(app)/admin` — still server-component. Port deferred; needs admin-scoped collections.

### Mutations

- [ ] Optimistic write pattern via `createCollection({ onUpdate, ... })` not wired yet. Current page still calls server actions directly; TanStack DB will pick up mutations on the Electric shape within ~1s.
- This works fine for correctness (the UI updates when Electric streams the change back) but feels slower than an optimistic pattern would. Follow-up commit.

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

## Carry-overs (future commits in this phase)

1. Port `/trips/[id]/options` to use live queries.
2. Port `/settings` once `praamid_credentials` shape with `columns` whitelist lands.
3. Port `/admin` with admin-scoped collections.
4. Add optimistic mutation pattern (e.g. toggle `notify` flips locally before the server action returns).

## Definition of done

- [x] Foundation (packages, providers, collections, home page) green on local checks.
- [ ] All listed pages ported.
- [ ] Optimistic mutations pattern established.
- [ ] Two-tab live-sync smoke test on server.
