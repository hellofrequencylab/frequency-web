-- SCAN-638 (ADR-1459): six covering FK indexes + two auth.uid() initplans.
--
-- FOUND 2026-09-19 against Frequency Community. The 2026-08-31 scan had zero
-- unindexed_foreign_keys and zero auth_rls_initplan. Six FKs landed with later
-- Space / entitlement work without a leading index, and two read-own policies
-- call auth.uid() bare so Postgres re-evaluates it per row.
--
-- 1. Recreate entitlement_grants read own and space_circle_optouts read own
--    with (select auth.uid()). Predicate is identical. Evaluation moves to an
--    initplan, matching 20260923000000_advisor_sweep_initplan_fk_indexes.sql
--    and 20260611144007_wrap_rls_auth_calls_in_select.sql.
--
-- 2. Covering indexes on the six FKs the advisor named. Nullable attribution
--    columns use a partial index (20270318000000_cover_attribution_fk_indexes.sql).
--    NOT NULL FKs get a full index. space_id on entitlement_grants is the
--    cascade path; member_profile_id / profile_id / ask_id are lookup columns
--    whose existing composites do not lead with the FK.
--
-- DRAFTED ONLY. The row forbids apply_migration and DDL execute_sql from an
-- agent session. Owner applies later: execute_sql, then insert
-- supabase_migrations.schema_migrations at version 20270345006400.
-- Do not touch spatial_ref_sys (OWN-006).
--
-- House style: additive + idempotent. SAFE to re-run. No em dashes.
--
-- ROLLBACK:
--   drop index if exists public.entitlement_grants_space_id_idx;
--   drop index if exists public.space_benefit_redemptions_member_profile_id_idx;
--   drop index if exists public.space_calendar_day_notes_created_by_idx;
--   drop index if exists public.space_calendar_entries_created_by_idx;
--   drop index if exists public.space_circle_optouts_profile_id_idx;
--   drop index if exists public.space_donations_ask_id_idx;
--   (then recreate the two policies from 20270345002800 / 20270345005800)

-- ── 1. auth_rls_initplan ─────────────────────────────────────────────────────

drop policy if exists "entitlement_grants read own" on public.entitlement_grants;
create policy "entitlement_grants read own"
  on public.entitlement_grants
  for select
  using (
    profile_id in (
      select p.id from public.profiles p where p.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "space_circle_optouts read own" on public.space_circle_optouts;
create policy "space_circle_optouts read own"
  on public.space_circle_optouts
  for select
  using (
    profile_id in (
      select p.id from public.profiles p where p.auth_user_id = (select auth.uid())
    )
  );

-- ── 2. unindexed_foreign_keys ────────────────────────────────────────────────

create index if not exists entitlement_grants_space_id_idx
  on public.entitlement_grants (space_id);

create index if not exists space_benefit_redemptions_member_profile_id_idx
  on public.space_benefit_redemptions (member_profile_id);

create index if not exists space_calendar_day_notes_created_by_idx
  on public.space_calendar_day_notes (created_by)
  where created_by is not null;

create index if not exists space_calendar_entries_created_by_idx
  on public.space_calendar_entries (created_by)
  where created_by is not null;

create index if not exists space_circle_optouts_profile_id_idx
  on public.space_circle_optouts (profile_id);

create index if not exists space_donations_ask_id_idx
  on public.space_donations (ask_id)
  where ask_id is not null;
