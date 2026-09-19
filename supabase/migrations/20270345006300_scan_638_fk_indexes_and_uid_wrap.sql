-- SCAN-638 / ADR-1442: greenfield replay of the six FK covering indexes and the
-- two read-own (select auth.uid()) wraps that already exist on Frequency Community.
--
-- PRODUCTION already has every object this file names (advisor read 2026-09-19
-- evening: zero unindexed_foreign_keys, zero auth_rls_initplan). The creating
-- files still unwrap auth.uid(). This file is IF NOT EXISTS / drop-and-recreate
-- so a fresh db reset matches production.
--
-- Draft only. Do not apply from an agent session. Do not touch spatial_ref_sys.

-- (1) Covering indexes — names match production --------------------------------
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

-- (2) Initplan wrap — same USING as production ---------------------------------
drop policy if exists "entitlement_grants read own" on public.entitlement_grants;
create policy "entitlement_grants read own"
  on public.entitlement_grants
  for select
  using (
    profile_id in (
      select p.id from public.profiles p
      where p.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "space_circle_optouts read own" on public.space_circle_optouts;
create policy "space_circle_optouts read own"
  on public.space_circle_optouts
  for select
  using (
    profile_id in (
      select p.id from public.profiles p
      where p.auth_user_id = (select auth.uid())
    )
  );
