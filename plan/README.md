# Multi-phase refactor plan

Goal: UI that feels always-in-sync (no stale "last checked", live swap state), forms handled by TanStack Form, queries by TanStack Query/DB. Path chosen: **Postgres + ElectricSQL** for true server→client push. Data reset is acceptable (2 users, hobby project).

## Phases

| # | File | Status | Summary |
|---|------|--------|---------|
| 1 | [phase-1-postgres.md](phase-1-postgres.md) | done (pending server verify) | Swap SQLite → Postgres. Also fixes the current `better-sqlite3` NODE_MODULE_VERSION crash. |
| 2 | [phase-2-electric.md](phase-2-electric.md) | done (pending server verify) | Add ElectricSQL sync service + auth-gated shape proxy. |
| 3 | [phase-3-tanstack-db.md](phase-3-tanstack-db.md) | not started | TanStack DB collections (Electric + Query Collection) wired into the UI. |
| 4 | [phase-4-tanstack-form.md](phase-4-tanstack-form.md) | not started | Port every form to `@tanstack/react-form` + server-action validation. |
| 5 | [phase-5-live-state.md](phase-5-live-state.md) | not started | Add `lastCheckedAt` / `swapInProgress` columns; live badges without refresh. |

## Rules

- Each phase = one or more PRs, not one giant merge.
- Keep the crash-fix (phase 1) small and shippable on its own.
- Update the file's **Status** field + task checklist as you go. That's what future sessions will read.
- Cross-phase decisions go in this README under "Decisions" below.

## Decisions

- **2026-04-21** — data reset accepted; no SQLite→Postgres data migration.
- **2026-04-21** — admin role is now DB-driven only; `ADMIN_EMAILS` env var removed in a pre-phase commit. Bootstrap first admin via `scripts/set-user-role.ts`.
- **2026-04-21** — rename to "ferry" deferred; not doing it now.

## Open questions

- Do we run Electric on the same Unraid host, or split to its own container? (default: same host, internal docker network)
- For hot paths with auth-per-user (e.g. trips scoped to `user_id`), does Electric's `where` filter suffice, or do we need a gateway/proxy per user?
