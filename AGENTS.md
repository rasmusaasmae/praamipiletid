<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Migrations

Always generate migrations with `bun run db:generate --name <meaningful_name>` (aliases `drizzle-kit generate`). Never hand-write or hand-edit files in `drizzle/`. Drizzle tracks migrations by hash of the file contents; any post-hoc edits silently desync history across environments.
