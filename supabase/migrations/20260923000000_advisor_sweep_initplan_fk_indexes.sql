-- Advisor sweep (2026-07-01): auth_rls_initplan + unindexed_foreign_keys.
--
-- 1. Six policies from 20260821000000_resonance_phase0_scaffolding.sql call auth.uid()
--    unwrapped, so Postgres re-evaluates it per row (advisor: auth_rls_initplan).
--    Recreate them with the (select auth.uid()) initplan form, matching the repo-wide
--    convention set in 20260611144007_wrap_rls_auth_calls_in_select.sql. Policy
--    semantics are unchanged — only the evaluation strategy moves to an initplan.
--
-- 2. Thirteen foreign keys reported by unindexed_foreign_keys get covering indexes
--    (write-heavy tables excluded: none of these are hot-write paths; all are lookup
--    or moderation columns), matching 20260820000000_fk_covering_indexes.sql naming.

-- ── 1. auth_rls_initplan ─────────────────────────────────────────────────────

drop policy if exists "suggestion_hidden: read own" on public.suggestion_hidden;
create policy "suggestion_hidden: read own"
  on public.suggestion_hidden for select
  using (profile_id in (select id from public.profiles where auth_user_id = (select auth.uid())));

drop policy if exists "suggestion_hidden: insert own" on public.suggestion_hidden;
create policy "suggestion_hidden: insert own"
  on public.suggestion_hidden for insert
  with check (profile_id in (select id from public.profiles where auth_user_id = (select auth.uid())));

drop policy if exists "suggestion_hidden: delete own" on public.suggestion_hidden;
create policy "suggestion_hidden: delete own"
  on public.suggestion_hidden for delete
  using (profile_id in (select id from public.profiles where auth_user_id = (select auth.uid())));

drop policy if exists "member_match_prefs: read own" on public.member_match_prefs;
create policy "member_match_prefs: read own"
  on public.member_match_prefs for select
  using (profile_id in (select id from public.profiles where auth_user_id = (select auth.uid())));

drop policy if exists "member_match_prefs: insert own" on public.member_match_prefs;
create policy "member_match_prefs: insert own"
  on public.member_match_prefs for insert
  with check (profile_id in (select id from public.profiles where auth_user_id = (select auth.uid())));

drop policy if exists "member_match_prefs: update own" on public.member_match_prefs;
create policy "member_match_prefs: update own"
  on public.member_match_prefs for update
  using (profile_id in (select id from public.profiles where auth_user_id = (select auth.uid())))
  with check (profile_id in (select id from public.profiles where auth_user_id = (select auth.uid())));

-- ── 2. unindexed_foreign_keys ────────────────────────────────────────────────

create index if not exists applications_reviewed_by_idx on public.applications (reviewed_by);
create index if not exists events_cancelled_by_idx on public.events (cancelled_by);
create index if not exists funnels_created_by_idx on public.funnels (created_by);
create index if not exists library_assets_created_by_idx on public.library_assets (created_by);
create index if not exists library_assets_parent_id_idx on public.library_assets (parent_id);
create index if not exists library_collection_items_asset_id_idx on public.library_collection_items (asset_id);
create index if not exists library_collections_created_by_idx on public.library_collections (created_by);
create index if not exists library_styles_created_by_idx on public.library_styles (created_by);
create index if not exists library_versions_created_by_idx on public.library_versions (created_by);
create index if not exists space_reviews_author_profile_id_idx on public.space_reviews (author_profile_id);
create index if not exists space_updates_author_profile_id_idx on public.space_updates (author_profile_id);
create index if not exists space_updates_post_id_idx on public.space_updates (post_id);
create index if not exists suggestion_hidden_hidden_profile_id_idx on public.suggestion_hidden (hidden_profile_id);
