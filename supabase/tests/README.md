# Database authz tests (RLS / RPC) — `supabase test db`

The DB-backed half of the authz harness (ADR-275). These pgTAP tests run against a real
Postgres **with the migrations applied**, so they verify the actual row-level-security policies
and `SECURITY DEFINER` RPCs — the things vitest can't (it mocks the DB).

> The app-level half (server-action / mutation **scoping**, e.g. the confused-deputy IDOR
> regressions from ADR-274) lives in `test/authz/*.test.ts` and runs under `pnpm test` — no DB
> needed. This directory is the complement: it tests the database's own guarantees.

## Run it

```bash
supabase start          # local Postgres with the migrations applied (needs the Supabase CLI + Docker)
pnpm test:rls           # = supabase test db  → runs every *.test.sql here via pgTAP
```

The Supabase CLI is not installed in the cloud sandbox, so these run **locally or in CI**, not in
the agent environment. CI wiring is in **`.github/workflows/db-tests.yml`** — it boots a fresh
local Supabase (`supabase db start`, applying every migration), then runs `supabase test db`. It's
**manual (`workflow_dispatch`) for now**: until the migration ledger is reconciled
(`OPEN-THREADS.md` §A2) a fresh full apply may surface latent migration bugs. Run it from the
Actions tab; once it's reliably green, enable the `pull_request` trigger and mark it a required
check so migration drift can never ship again.

## What's here / what to add

- `rls_enabled.test.sql` — smoke test: RLS is ON for every security-critical table. ✅ seeded.
- **Per-role policy tests** (add next): set the JWT claims for `anon` / a member / a host, then
  assert each can or cannot `select`/`insert`/`update` a given row. Pattern:
  ```sql
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '<auth_user_id>')::text, true);
  select is_empty($$ select * from financial_transactions $$, 'a member cannot read the ledger');
  ```
- **RPC tests** (add next): call each public `SECURITY DEFINER` function with crafted args and
  assert it self-enforces visibility (e.g. `search_handles_public`, `feed_for_viewer`,
  `match_help_chunks`) — they bypass RLS by design, so their internal checks are the boundary.

Keep each file `begin; select plan(N); … select * from finish(); rollback;` so tests never
mutate the database.
