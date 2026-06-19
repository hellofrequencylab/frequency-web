-- Re-key page_settings to (space_id, route) — CONTRACT step (Phase 0.5a, ENTITY-SPACES-BUILD
-- §0.5.4 / §B.4). Run ONLY after the expand migration (20260708000000_page_settings_space_id.sql)
-- is applied AND the backfill is verified in production (every page_settings row has a space_id;
-- the app has been dual-writing space_id for long enough that no NULLs can appear). This locks the
-- per-entity scope in:
--   1. enforce space_id NOT NULL (the backfill made this safe);
--   2. swap the primary key from `route` alone to the composite (space_id, route) — so a Space and
--      the root can each hold their own row for the same route, and the app's
--      onConflict 'space_id,route' upserts have their backing unique key;
--   3. RLS scoped `TO authenticated` — keep reads BROAD (presentation metadata is non-sensitive and
--      is read by the server's service-role client regardless of RLS), but constrain the policy to
--      authenticated roles; cross-tenant isolation is enforced by the query's space_id filter (the
--      readers always .eq('space_id', …)), with this policy as the defense-in-depth backstop.
--
-- VERIFY BEFORE RUNNING (expected zero):
--   select count(*) from public.page_settings where space_id is null;
--
-- House style: idempotent where possible, applied to production via the Supabase SQL Editor (the
-- repo migration-history baseline predates `db push` being safe — docs/WORKFLOW.md).
-- lib/database.types.ts is regenerated separately. This file is the canonical record.

-- ── 1. Enforce NOT NULL (safe once the backfill is confirmed) ────────────────────────────
alter table public.page_settings
  alter column space_id set not null;

-- ── 2. Swap the primary key route -> (space_id, route) ───────────────────────────────────
-- The original PK is the single column `route` (constraint page_settings_pkey,
-- 20260626120000_page_settings.sql). Drop it and make the composite the PK, so each (space, route)
-- pair is unique — the backing key for the app's onConflict 'space_id,route' upserts.
do $$ begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.page_settings'::regclass and contype = 'p'
      and conname = 'page_settings_pkey'
  ) then
    alter table public.page_settings drop constraint page_settings_pkey;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.page_settings'::regclass and contype = 'p'
  ) then
    alter table public.page_settings add primary key (space_id, route);
  end if;
end $$;

-- The composite PK provides the leading (space_id, route) index, so the explicit expand-step index
-- is now redundant — drop it to avoid a duplicate.
drop index if exists public.page_settings_space_route_idx;

-- ── 3. RLS scoped TO authenticated (broad read, scoped in query) ─────────────────────────
-- Replace the all-roles broad read with an authenticated-scoped broad read. RLS stays enabled;
-- the tenant boundary is enforced by the readers' explicit space_id filter (and the service-role
-- writers in the staff/operator-gated server actions). No client write policy (writes go through
-- the service-role admin client only), unchanged from the original table.
alter table public.page_settings enable row level security;

do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'page_settings'
      and policyname = 'page_settings_read_all'
  ) then
    drop policy page_settings_read_all on public.page_settings;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'page_settings'
      and policyname = 'page_settings_read_authenticated'
  ) then
    create policy page_settings_read_authenticated on public.page_settings
      for select to authenticated using (true);
  end if;
end $$;
