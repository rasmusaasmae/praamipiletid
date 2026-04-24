<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Libraries

When working with any external library, framework, SDK, API, or CLI tool, query the Context7 MCP for the relevant docs first. Your training data may be stale; Context7 is the source of truth for current syntax, configuration, and idioms.

DO use patterns and APIs the library documentation recommends. Prefer the simplest code that meets the requirement. AVOID custom abstractions, wrappers, or complex logic when a documented library primitive does the job.

# Migrations

Always generate migrations with `bun run db:generate --name <meaningful_name>` (aliases `drizzle-kit generate`). Never hand-write or hand-edit files in `drizzle/`. Drizzle tracks migrations by hash of the file contents; any post-hoc edits silently desync history across environments.
