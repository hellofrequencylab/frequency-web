-- SCAN-638: advisor follow-up after Space Circles / entitlements landed.
--
-- The 2026-08-31 scan recorded zero unindexed_foreign_keys and zero
-- auth_rls_initplan. The 2026-09-19 pass found six new FKs and two read-own
-- policies that call auth.uid() bare. Both arrived with tables that were empty
-- or tiny, so the indexes are effectively free and the wrap is the repo-wide
-- initplan form (20260615200000 / 20261104000000).
--
-- 1. auth_rls_initplan (2 WARNs): "entitlement_grants read own" and
--    "space_circle_optouts read own" re-evaluate auth.uid() per row. Wrapping it
--    in (select auth.uid()) lets Postgres treat it as a one-time initplan.
--    Predicate otherwise identical to the creating files
--    (20270345002800, 20270345005800).
--
-- 2. unindexed_foreign_keys (6 INFO): covering btree on the FK column the
--    advisor named. A composite that does not LEAD with the FK does not cover
--    it (space_benefit_redemptions_cap_idx starts with benefit_id;
--    space_circle_optouts PK starts with space_id).
--
--    entitlement_grants.space_id
--    space_benefit_redemptions.member_profile_id
--    space_calendar_day_notes.created_by
--    space_calendar_entries.created_by
--    space_circle_optouts.profile_id
--    space_donations.ask_id
--
-- No data is read or changed. spatial_ref_sys is PostGIS: leave it (OWN-006).
-- Draft in the repo; apply with execute_sql then a schema_migrations insert at
-- this file's 14-digit version. Never apply_migration or db push.
--
-- House style: additive + idempotent. SAFE to re-run. No em or en dashes.
--
-- ROLLBACK:
--   drop index if exists entitlement_grants_space_id_idx;
--   drop index if exists space_benefit_redemptions_member_profile_id_idx;
--   drop index if exists space_calendar_day_notes_created_by_idx;
--   drop index if exists space_calendar_entries_created_by_idx;
--   drop index if exists space_circle_optouts_profile_id_idx;
--   drop index if exists space_donations_ask_id_idx;
--   then recreate the two read-own policies with bare auth.uid().

-- ── auth_rls_initplan ──────────────────────────────────────────────────────────
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

-- ── unindexed_foreign_keys ─────────────────────────────────────────────────────
create index if not exists entitlement_grants_space_id_idx
  on public.entitlement_grants (space_id);

create index if not exists space_benefit_redemptions_member_profile_id_idx
  on public.space_benefit_redemptions (member_profile_id);

create index if not exists space_calendar_day_notes_created_by_idx
  on public.space_calendar_day_notes (created_by);

create index if not exists space_calendar_entries_created_by_idx
  on public.space_calendar_entries (created_by);

create index if not exists space_circle_optouts_profile_id_idx
  on public.space_circle_optouts (profile_id);

create index if not exists space_donations_ask_id_idx
  on public.space_donations (ask_id);
