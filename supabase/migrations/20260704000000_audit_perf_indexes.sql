-- Site audit (2026-06-18) — additive performance fixes. No behavior change, no data change.
--
-- 1) Covering indexes for 18 unindexed foreign keys (Supabase performance advisor:
--    `unindexed_foreign_keys`). An FK with no index on its referencing column forces a
--    sequential scan whenever the *referenced* row is deleted/updated (constraint check +
--    any cascade). Several of these point at `profiles` (host_id, created_by, updated_by,
--    owner_profile_id), so deleting a profile previously seq-scanned each child table.
--    Existing composite indexes (e.g. journey_enrollments {profile_id, plan_id}) do NOT
--    cover a plan-only lookup because the FK column is not the leading column.
--
-- 2) RLS init-plan fix on journey_completions (advisor: `auth_rls_initplan`). Wrapping
--    auth.uid() in a scalar subquery makes Postgres evaluate it once per query (InitPlan)
--    instead of once per row. Same semantics, far cheaper on multi-row reads.

-- 1) Covering indexes (idempotent).
create index if not exists event_tickets_entity_id_idx        on public.event_tickets (entity_id);
create index if not exists journey_enrollments_plan_id_idx     on public.journey_enrollments (plan_id);
create index if not exists journey_lesson_progress_item_id_idx on public.journey_lesson_progress (item_id);
create index if not exists journey_lesson_progress_plan_id_idx on public.journey_lesson_progress (plan_id);
create index if not exists journey_phase_events_event_id_idx   on public.journey_phase_events (event_id);
create index if not exists journey_phase_events_phase_id_idx   on public.journey_phase_events (phase_id);
create index if not exists journey_plan_items_parent_id_idx    on public.journey_plan_items (parent_id);
create index if not exists journey_runs_host_id_idx            on public.journey_runs (host_id);
create index if not exists journey_runs_kickoff_event_id_idx   on public.journey_runs (kickoff_event_id);
create index if not exists menu_config_updated_by_idx          on public.menu_config (updated_by);
create index if not exists page_chrome_overrides_updated_by_idx on public.page_chrome_overrides (updated_by);
create index if not exists page_settings_updated_by_idx        on public.page_settings (updated_by);
create index if not exists platform_settings_updated_by_idx    on public.platform_settings (updated_by);
create index if not exists profile_personas_entity_id_idx      on public.profile_personas (entity_id);
create index if not exists spaces_entity_id_idx                on public.spaces (entity_id);
create index if not exists spaces_owner_profile_id_idx         on public.spaces (owner_profile_id);
create index if not exists themes_created_by_idx               on public.themes (created_by);
create index if not exists walkthrough_updated_by_idx          on public.walkthrough (updated_by);

-- 2) RLS init-plan fix (identical predicate, auth.uid() wrapped as a scalar subquery).
drop policy if exists "journey_completions: read own" on public.journey_completions;
create policy "journey_completions: read own" on public.journey_completions
  for select
  using (
    profile_id in (
      select profiles.id
      from public.profiles
      where profiles.auth_user_id = (select auth.uid())
    )
  );
