# -----------------------------
# Base image (Node runtime with Bun installed for fast installs)
# -----------------------------
FROM node:22-bookworm-slim AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl unzip ca-certificates \
    && curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------
# Dependencies stage (includes dev deps for build)
# -----------------------------
FROM base AS deps

COPY package.json bun.lock* ./

RUN bun install --no-save --frozen-lockfile

# -----------------------------
# Production dependencies stage
# -----------------------------
FROM base AS prod-deps

COPY package.json bun.lock* ./

RUN bun install --no-save --frozen-lockfile --production

# -----------------------------
# Builder stage
# -----------------------------
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Placeholders only — `next build` imports modules that eagerly validate env
# vars. Real values are provided at runtime by docker-compose / Unraid.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    APP_URL=http://localhost:3000 \
    BETTER_AUTH_SECRET=build-placeholder-at-least-32-chars-long

RUN node ./node_modules/.bin/next build

# -----------------------------
# Production runner stage
# -----------------------------
# Microsoft's Playwright image bundles Chromium + the exact system libs
# Playwright needs. Pin the tag to match the playwright npm version so the
# bundled browser and client stay in sync.
FROM mcr.microsoft.com/playwright:v1.60.0-noble AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The Playwright base ships a non-root `pwuser` (uid/gid 1001) set up for
# running headless Chromium. Reuse it instead of creating our own.
RUN chown -R pwuser:pwuser /app

COPY --from=builder --chown=pwuser:pwuser /app/.next/standalone ./
COPY --from=builder --chown=pwuser:pwuser /app/.next/static ./.next/static
COPY --from=builder --chown=pwuser:pwuser /app/public ./public

COPY --from=builder --chown=pwuser:pwuser /app/drizzle ./drizzle
COPY --from=prod-deps --chown=pwuser:pwuser /app/node_modules ./node_modules

# Chromium lives under /ms-playwright in the base image and is owned by
# root. The app runs as pwuser, so expose the browser cache path explicitly.
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

USER pwuser

EXPOSE 3000

CMD ["node", "./server.js"]

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
