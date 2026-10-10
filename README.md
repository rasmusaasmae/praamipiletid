# Praamipiletid

Moves your praamid.ee ferry tickets to a better departure when one opens up, without paying anything extra.

You list the departures you would rather be on, in order. Every 10 seconds the worker checks praamid.ee; when a more wanted departure has room for your vehicle, it changes the ticket, commits only if the change costs nothing, and emails you. Terms are defined in [GLOSSARY.md](GLOSSARY.md).

## Layout

| Path                 | What it is                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `apps/web`           | Vite + React + TanStack Router single-page app                                               |
| `apps/api`           | Hono on Bun: the HTTP API, sign-in (better-auth with Pocket ID) and the built web app        |
| `apps/worker`        | Bun process: the swap cycle on DBOS, the praamid.ee login bot (Playwright) and email         |
| `packages/db`        | Drizzle schema, connection and migrations                                                    |
| `packages/praamidee` | praamid.ee client, the `Praamid` port the app codes against, and an in-memory fake for tests |
| `packages/core`      | Ticket and option rules shared by the API and the worker                                     |
| `packages/logger`    | pino logger with an optional Discord sink                                                    |

The API and the worker share one Postgres. The API hands praamid.ee login requests to the worker with `NOTIFY`, and the worker announces changes back the same way; the API streams them to open pages as server-sent events.

## Development

Requires Bun and a Postgres.

```bash
bun install
cp .env.example .env   # fill in; APP_URL=http://localhost:5173 for the dev server
bun --env-file=.env run dev:api      # http://localhost:3000, applies migrations
bun --env-file=.env run dev:worker
bun run dev:web                      # http://localhost:5173, proxies /api to the API
```

The worker needs a Chromium for the login bot: `bunx playwright install chromium`.

### Tests

Tests run against a real Postgres that they empty between tests, with praamid.ee and email faked. They describe behaviour at two seams: the worker's `runCycle` and the HTTP API.

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/praamipiletid_test bun test
```

### Database changes

Change `packages/db/src/schema.ts`, then generate a migration:

```bash
bun run db:generate --name <meaningful_name>
```

## Deployment

`docker-compose.yml` runs Postgres, the API and the worker from the one image published to `ghcr.io/rasmusaasmae/praamipiletid`. The API applies migrations on start; the worker waits for it.
