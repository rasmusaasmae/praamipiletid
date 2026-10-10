# One image for both processes: the API (default command) and the worker
# (`bun apps/worker/src/main.ts`). Bun runs the TypeScript sources directly;
# only the web app is built.

# -----------------------------
# Dependencies (including dev deps, for the web build)
# -----------------------------
FROM oven/bun:1.4.2 AS deps

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/logger/package.json packages/logger/
COPY packages/praamidee/package.json packages/praamidee/

RUN bun install --frozen-lockfile --ignore-scripts

# -----------------------------
# Web build
# -----------------------------
FROM deps AS build

COPY . .
RUN bun run build

# -----------------------------
# Production dependencies only
# -----------------------------
FROM deps AS prod-deps

RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
    && bun install --frozen-lockfile --production --ignore-scripts

# -----------------------------
# Runner
# -----------------------------
# Microsoft's Playwright image bundles Chromium and the system libraries the
# worker's login bot needs. Keep its tag in step with the playwright package.
FROM mcr.microsoft.com/playwright:v1.59.1-noble AS runner

COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

# The Playwright base ships a non-root `pwuser` set up for headless Chromium.
COPY --from=prod-deps --chown=pwuser:pwuser /app ./
COPY --chown=pwuser:pwuser apps ./apps
COPY --chown=pwuser:pwuser packages ./packages
COPY --from=build --chown=pwuser:pwuser /app/apps/web/dist ./apps/web/dist

ENV NODE_ENV=production \
    PORT=3000 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

USER pwuser

EXPOSE 3000

CMD ["bun", "apps/api/src/main.ts"]
