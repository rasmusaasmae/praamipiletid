# Project

Bun workspace: `apps/web` (Vite + React + TanStack Router), `apps/api` (Hono on Bun, better-auth with Pocket ID), `apps/worker` (DBOS swap cycle, Playwright login bot), and shared `packages/*`. See README.md for the layout and GLOSSARY.md for domain terms; use those terms in code, tests and UI copy.

Bun runs everything, including production. Do not add a build step for the API or worker.

# Libraries

When working with any external library, framework, SDK, API, or CLI tool, query the Context7 MCP for the relevant docs first. Your training data may be stale; Context7 is the source of truth for current syntax, configuration, and idioms.

DO use patterns and APIs the library documentation recommends. Prefer the simplest code that meets the requirement. AVOID custom abstractions, wrappers, or complex logic when a documented library primitive does the job.

# Tests

Work test-first. Tests live at two seams only: the worker's `runCycle` (`apps/worker/test`) and the HTTP API through `app.request()` (`apps/api/test`). They run against a real Postgres (`TEST_DATABASE_URL`); praamid.ee is faked with `@praamipiletid/praamidee/fake` and email with the worker's fake mailer. Do not mock our own modules, and check results through the app's interfaces or the fakes' state, not by querying tables.

Test business decisions, not every edge case.

# Migrations

Always generate migrations with `bun run db:generate --name <meaningful_name>` (aliases `drizzle-kit generate` in `packages/db`). Never hand-write or hand-edit files in `packages/db/drizzle/`. Drizzle tracks migrations by hash of the file contents; any post-hoc edits silently desync history across environments.
