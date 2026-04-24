<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Migrations

Always generate migrations with `bun run db:generate --name <meaningful_name>` (aliases `drizzle-kit generate`). Never hand-write or hand-edit files in `drizzle/` — including adding data-backfill statements. Drizzle tracks migrations by hash of the file contents; any post-hoc edits silently desync history across environments and reintroduce the "migrator loops on `0000` because `__drizzle_migrations` is empty" failure mode we had to nuke-and-repave once already.

If you need a data migration the schema-differ can't express (e.g. backfilling a column from another table before dropping it), do it as a separate runtime step, not by editing generated SQL. If drizzle's generated SQL is wrong for your case, fix it by changing `db/schema.ts` so the generator produces what you want — not by editing the emitted file.
