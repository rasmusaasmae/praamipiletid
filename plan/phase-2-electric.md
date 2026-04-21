# Phase 2 — ElectricSQL sync service

**Status:** done (pending server-side verification)
**Blocked by:** phase 1 ✓
**Blocks:** phase 3

## Why

ElectricSQL reads a Postgres replication slot and serves "shapes" (subsets of tables) over HTTP. Clients subscribe and get live pushes. This is what makes the UI truly always-in-sync without client polling.

## Scope

### Electric container

- [x] `electric` service in `docker-compose.yml` using `electricsql/electric:${ELECTRIC_TAG:-latest}` (pin via `ELECTRIC_TAG` env later).
- [x] Same docker network as postgres; `wal_level=logical` already set on postgres in phase 1.
- [x] Electric connects with the same `ferry` superuser (superuser implies REPLICATION role).
- [x] Internal-only by default; local dev exposes via `ELECTRIC_PORT` (default 3001) so `bun dev` on the host can reach it. Unraid deploy should leave `ELECTRIC_PORT` unset.
- [x] Named volume `ferry_electric` for `/app/persistent` (shape storage, replication offsets).

### Gateway / auth proxy

- [x] `app/api/shape/route.ts`:
  - Validates better-auth session (401 if missing).
  - Forwards only `live/table/handle/offset/cursor/columns` to Electric — any client-supplied `where` is dropped.
  - Injects `where "user_id" = '<sessionUserId>'` for user-scoped tables (`trips`, `trip_options`, `tickets`, `praamid_credentials`).
  - Admin-only tables (`user`, `audit_logs`, `settings`) return unfiltered, gated by `session.user.role === 'admin'`.
  - Unknown tables → 403.
  - Strips `content-encoding`/`content-length` response headers (per Electric's Next.js guide).
- [x] Uses `ELECTRIC_INSECURE=true` on the Electric service; security is enforced entirely at the Next.js gateway.

### Schema prep

- [x] Denormalized `user_id` column on `trip_options` and `tickets` (Electric `where` can't join).
- [x] Foreign keys cascade from `user`; index added on `user_id` for both tables.
- [x] All insert paths (`actions/tickets.ts`, `actions/trips.ts`) set `userId: session.user.id`.
- [x] Regenerated `drizzle/0000_init.sql` from the updated schema (single init migration — phase 1 not yet deployed).

## Risks / gotchas

- `ELECTRIC_INSECURE=true` means Electric trusts any caller. The only thing keeping unauthorized traffic out is the docker network boundary — **never expose Electric's port on the public internet without fronting it with the Next.js proxy**.
- Postgres logical replication slots survive restarts; if Electric disconnects and never reconnects, WAL can fill disk. Keep an eye on `pg_replication_slots`.
- Electric's `where` parses SQL — we sanitize `user_id` to `[a-zA-Z0-9_-]+` and quote the identifier. better-auth generates UUID-like ids, so this is safe.
- The app's existing port 3000 conflicts with Electric's default 3000 on the host; dev uses `ELECTRIC_PORT=3001`.
- Two users on the same DB row: `tickets.tripId` is the PK and `trip.userId` is the owner; `tickets.userId` now duplicates that. Keep them in sync by always writing both (enforced at the insert site).

## Local verification (done here)

- `bun run typecheck` — clean.
- `bun run lint` — clean.

## Server verification (still to do)

- `docker compose up -d postgres electric` — Electric container stays healthy, connects to postgres, creates its replication slot.
- `docker compose up app` — app boots, reaches Electric at `http://electric:3000`.
- Manual shape fetch with a logged-in session cookie:
  `curl -N --cookie "better-auth.session_token=…" "http://localhost:3000/api/shape?table=trips&offset=-1"` should stream rows scoped to that user only.
- Cross-user check: user A's session cannot see user B's trips (inject their session cookie and confirm the response omits B's rows).
- Admin-only: `table=audit_logs` → 403 as non-admin, 200 as admin.

## Definition of done

- [x] Code + schema + compose changes committed.
- [x] Local typecheck + lint green.
- [ ] Server-side deploy + gateway smoke tests (above).
