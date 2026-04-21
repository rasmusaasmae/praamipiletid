# Phase 2 — ElectricSQL sync service

**Status:** not started
**Blocked by:** phase 1 (needs Postgres)
**Blocks:** phase 3

## Why

ElectricSQL reads a Postgres replication slot and serves "shapes" (subsets of tables) over HTTP. Clients subscribe and get live pushes. This is what makes the UI truly always-in-sync without client polling.

## Scope

### Electric container

- [ ] Add `electric` service to `docker-compose.yml` using `electricsql/electric:latest` (pin the tag once we pick a version).
- [ ] Connect it to the same internal network as postgres. Use Postgres logical replication: set `wal_level = logical` on the postgres service (via `command:` flag).
- [ ] Give Electric its own DB URL env var pointing at the same `ferry_pg` volume.
- [ ] Expose Electric only on the internal docker network — *never* directly to the host. All client traffic goes via the Next.js app's gateway route.

### Gateway / auth proxy

- [ ] Add `app/api/shape/route.ts` (or similar) that:
  - [ ] Validates the user's better-auth session.
  - [ ] Rewrites the incoming shape request to add `where user_id = '<sessionUserId>'` for user-scoped tables (trips, tripOptions, tickets, praamidCredentials).
  - [ ] Allows admin-only shapes (users, auditLogs, settings) only if `role = 'admin'`.
  - [ ] Proxies to the internal Electric URL and streams the response back.
- [ ] Decide on request/response streaming: Electric uses long-lived HTTP with `next-cursor`. Next.js 16 Route Handlers support `Response` with a ReadableStream — verify in the Next 16 docs (AGENTS.md rule: read node_modules/next/dist/docs).

### Schema prep

- [ ] Ensure every user-scoped table has `user_id` as a first-class column (already true for trips, credentials; trip_options/tickets inherit via trip_id → may need a denormalised user_id column or Electric has to do a join, which it doesn't — plan for denorm).
- [ ] Add replication publication configuration.

## Risks / gotchas

- Electric's `where` filter is per-shape — the gateway has to inject it correctly.
- Postgres logical replication requires superuser or `REPLICATION` role.
- On Unraid: postgres volume is a named docker volume; logical-replication slots survive restarts but can fill disk if Electric disconnects and never reconnects.
- Electric's storage directory (`/app/persistent`) needs its own volume.

## Definition of done

- `curl -N https://<host>/api/shape?table=trips` with a valid session cookie streams live changes.
- Two browser tabs: inserting a trip in one reflects in the other within <1s with no manual refresh.
- Non-admin users cannot access admin-only shapes.
- CI green, deployed to Unraid.
