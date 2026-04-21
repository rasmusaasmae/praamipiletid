# Phase 1 — SQLite → Postgres

**Status:** done (pending server-side verification)
**Blocks:** phase 2, 3, 4, 5
**Also fixes:** production crash `ERR_DLOPEN_FAILED` on `better_sqlite3.node` (Node 22-built binding loaded in Node 24 Playwright runner).

## Why

- Electric sync service requires Postgres — can't do phase 2+ on SQLite.
- Removes native-binding build toolchain (`python3 make g++`) from Docker image.
- Eliminates the NODE_MODULE_VERSION drift between build and runtime Node versions.

## Scope

### Database

- [x] Pick Postgres version — `postgres:16-alpine`.
- [x] Add `postgres` service to `docker-compose.yml` with named volume `ferry_pg`, port exposed via `POSTGRES_PORT` (default 5432), `wal_level=logical` set now to prep for phase 2.
- [x] Add `DATABASE_URL` to `.env.example` and compose env; remove `DATABASE_PATH`.
- [x] Local dev: `docker compose up -d postgres` + `bun run db:migrate` + `bun dev`.

### Drizzle

- [x] Swap driver: `better-sqlite3` → `postgres.js` + `drizzle-orm/postgres-js`.
- [x] Rewrite `db/schema.ts`: `sqliteTable` → `pgTable`, timestamp columns use `timestamp({withTimezone:true, mode:'date'}).defaultNow()`, boolean columns via `boolean(...)`.
- [x] Rewrite `db/auth-schema.ts` (provider stays `'pg'` in `drizzleAdapter`).
- [x] Update `db/index.ts` and `db/migrate.ts` for postgres.js.
- [x] Delete old sqlite migrations. Fresh `drizzle/0000_init.sql` generated.
- [x] `drizzle.config.ts` → `dialect: 'postgresql'`, reads `DATABASE_URL`.

### App code

- [x] Replaced all `.get()` / `.all()` / `.run()` — pg driver is await-only.
- [x] Transactions converted from sync callbacks to `await db.transaction(async tx => …)`.
- [x] `instrumentation.ts` runs the postgres migrator before the poller + credential-expiry watcher start.

### Docker / deploy

- [x] Dropped `python3 make g++` from both `deps` and `prod-deps` stages.
- [x] Removed `VOLUME ["/app/data"]` from `Dockerfile` and `praamipiletid_data` volume from compose.
- [x] `.env.example` now has `DATABASE_URL`; `DATABASE_PATH` and `ADMIN_EMAILS` removed.
- [ ] Update Unraid env file: set `DATABASE_URL`, drop `DATABASE_PATH` + `ADMIN_EMAILS`. Add a `postgres` service to the server's compose file with a named volume on the Unraid appdata share.

### Auth bootstrap

- [x] `scripts/set-user-role.ts <email> <user|admin>` rewritten for postgres.js — run inside the container:
  `docker compose exec app node --import tsx scripts/set-user-role.ts me@example.com admin`
- [x] `lib/auth.ts` no longer reads `ADMIN_EMAILS`; new users always default to `role: 'user'`.

## Risks / gotchas

- Timestamp defaults: switched to `defaultNow()`. `$onUpdate(() => new Date())` still works for mutation timestamps.
- Transactions: drizzle pg transactions are async; old `db.transaction(tx => { tx.update().run() })` patterns became `await db.transaction(async tx => { await tx.update()… })`.
- `better-auth` `admin` plugin still mutates `user.role` directly — unchanged.
- Existing production data is discarded — user confirmed (2 users, acceptable to reset).

## Local verification (done here)

- `bun run typecheck` — clean.
- `bun run lint` — clean.

## Server verification (still to do on Unraid)

- `docker compose up` boots postgres + app; health check green; no `ERR_DLOPEN_FAILED`.
- Sign in with Google works; user row created; ntfyTopic populated.
- `scripts/set-user-role.ts rasmus.aasmae@gmail.com admin` promotes the first admin.
- Image built, pushed to ghcr.io, Watchtower pulls on Unraid.

## Definition of done

- [x] Code + schema + migrations on postgres.
- [x] Local typecheck + lint green.
- [ ] Server-side deploy + smoke test (above).
