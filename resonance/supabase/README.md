# Resonance — database

Everything this app owns lives in **one Postgres schema: `resonance`**. That is
the whole isolation strategy. Read [`../docs/ISOLATION.md`](../docs/ISOLATION.md)
before writing any migration.

## The one rule

> **No object in `resonance` may hold a foreign key into another schema.**

User identity is stored as a plain `uuid` (the host/Frequency user id, or this
app's own auth id), never a foreign key to `auth.users` or `public`. This is the
single thing that keeps the app liftable.

## Where it runs today vs. later

| | Today (shared project) | Later (own project) |
|---|---|---|
| Database | Frequency Supabase, `resonance` schema | Dedicated Supabase project |
| Reached via | Trusted server (service role) | Same code, new env vars |
| Move cost | n/a | `pg_dump -n resonance` + restore + repoint env |

## Migrations

- `0001_resonance_init.sql` — creates the schema, deny-by-default grants, the
  `set_updated_at()` trigger fn, and the `current_external_id()` identity helper.
  **No feature tables** yet; those land per build section.

Apply (shared project, via Supabase MCP/CLI): run the migration files in order.
Because the schema is namespaced, this never touches Frequency's `public` tables.
