# -----------------------------
# Base image (Node runtime with Bun installed for fast installs)
# -----------------------------
# Bun does not support `better-sqlite3` (oven-sh/bun#4290), so the app runs
# under Node. Bun is still used for dependency installs via bun.lock.
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

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./

RUN bun install --no-save --frozen-lockfile

# -----------------------------
# Production dependencies stage
# -----------------------------
FROM base AS prod-deps

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./

RUN bun install --no-save --frozen-lockfile --production

# -----------------------------
# Builder stage
# -----------------------------
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN node ./node_modules/.bin/next build

# -----------------------------
# Production runner stage
# -----------------------------
FROM node:22-bookworm-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --no-log-init -g nodejs nextjs && \
    mkdir -p /app/data && chown -R nextjs:nodejs /app

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    DATABASE_PATH=/app/data/praamipiletid.db

VOLUME ["/app/data"]

USER nextjs

EXPOSE 3000

CMD ["node", "./server.js"]

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
