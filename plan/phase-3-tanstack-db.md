# Phase 3 — TanStack DB collections

**Status:** not started
**Blocked by:** phase 2
**Blocks:** phase 5

## Why

TanStack DB sits between collections (sync sources) and the UI (`useLiveQuery`). This is what replaces server-component `await db.select(...)` with reactive client-side queries that stay in sync without refresh.

## Scope

### Packages

- [ ] Install: `@tanstack/db`, `@tanstack/react-db`, `@tanstack/electric-db-collection`, `@tanstack/react-query`, `@tanstack/query-db-collection`.
- [ ] Decide: do we adopt `@tanstack/react-query` for ephemeral server state too (e.g. `/api/swap-now` POST), or keep server actions? Recommendation: keep server actions for mutations, use react-query only where Query Collection needs it.

### Collections

Define once (in `lib/collections.ts` or similar):

- [ ] `tripsCollection` — Electric shape, filtered to session user.
- [ ] `tripOptionsCollection` — Electric shape, joined on trip_id → user_id (after denorm in phase 2).
- [ ] `ticketsCollection` — Electric shape.
- [ ] `settingsCollection` — Electric shape, read-only for non-admin.
- [ ] `usersCollection` — Electric shape, admin-only.
- [ ] `auditLogsCollection` — Electric shape, admin-only, capped query (e.g. last 200).
- [ ] Swap-state collection — see phase 5; can be Electric or a Query Collection with a short refetchInterval, TBD.

### Page rewrites

Switch each page from server-component fetch to client `useLiveQuery`:

- [ ] `/[locale]/(app)/` home — trip list + per-trip options.
- [ ] `/[locale]/(app)/trip/[id]` trip detail.
- [ ] `/[locale]/(app)/settings` settings page (own trips, credentials status).
- [ ] `/[locale]/(app)/admin` admin users table, audit log, poll interval editor.

### Mutations

- [ ] Establish pattern: call server action → optimistic update in the collection → reconcile on action response. TanStack DB has `createOptimisticAction` — use it.
- [ ] Audit every action in `actions/*.ts` for idempotency and retry behavior.

## Risks / gotchas

- Next.js 16 server components already stream data to clients; be deliberate about which pages must remain server-rendered for SEO/performance and which become client-driven.
- Locale strings from `next-intl` need to stay SSR'd to avoid FOUC.
- Auth session is still only available server-side; either expose a cheap `/api/me` or use better-auth's client hook.

## Definition of done

- All listed pages read from collections; no page fetches trips directly from the DB in server code anymore (except for SEO/SSR shell).
- Opening two tabs and performing a mutation in one (e.g. create trip) reflects in the other within <1s without manual refresh.
- `useLiveQuery`-driven lists show loading/empty/error states cleanly.
