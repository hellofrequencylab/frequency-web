-- Meta-scan DB-hygiene sweep (advisor follow-up after the Shop rework, #1647).
--
-- Two behavior-preserving fixes surfaced by the Supabase advisor:
--
-- 1. auth_rls_initplan (2 WARNs): the "read own …" SELECT policies on
--    supporter_contributions and practice_timer_sessions call auth.uid() bare, so the
--    planner re-evaluates it per row. Wrapping it in a scalar subselect — (select auth.uid())
--    — lets Postgres treat it as a one-time initplan constant. The predicate is otherwise
--    byte-identical to the live policy (verified against pg_policies before writing this).
--
-- 2. unindexed_foreign_keys (8 INFO): add covering btree indexes for the FK columns the
--    advisor flags. Purely additive; no covering index exists for any of them today
--    (verified against pg_indexes). Helps FK-join / cascade-delete planning at scale.
--
-- No data is read or changed. Both fixes are reversible (restore the bare policy / drop
-- the index).

-- ── auth_rls_initplan ──────────────────────────────────────────────────────────
drop policy if exists "read own supporter contributions" on public.supporter_contributions;
create policy "read own supporter contributions" on public.supporter_contributions
  for select using (
    profile_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
  );

drop policy if exists "read own active timer session" on public.practice_timer_sessions;
create policy "read own active timer session" on public.practice_timer_sessions
  for select using (
    profile_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
  );

-- ── unindexed_foreign_keys ─────────────────────────────────────────────────────
create index if not exists idx_app_overrides_space_id
  on public.app_overrides (space_id);
create index if not exists idx_app_overrides_updated_by
  on public.app_overrides (updated_by);
create index if not exists idx_business_intake_created_by
  on public.business_intake (created_by);
create index if not exists idx_practice_timer_sessions_practice_id
  on public.practice_timer_sessions (practice_id);
create index if not exists idx_space_automation_rules_created_by
  on public.space_automation_rules (created_by);
create index if not exists idx_space_bookings_product_id
  on public.space_bookings (product_id);
create index if not exists idx_space_drip_enrollments_contact_id
  on public.space_drip_enrollments (contact_id);
create index if not exists idx_space_drip_sequences_created_by
  on public.space_drip_sequences (created_by);
