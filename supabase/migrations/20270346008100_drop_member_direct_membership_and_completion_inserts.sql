-- SCAN-842 (meta scan eight, 2026-10-12): two member INSERT policies outlived every app writer.
--
-- "memberships: crew+ join own" let any member insert a memberships row for themselves with any
-- circle_id, any status (default 'active') and any volunteer_role. An active row is entry to the
-- Circle (private.can_enter_circle), and volunteer_role 'guide' makes the member a Circle Admin
-- (lib/core/circle-roles.ts), so one direct PostgREST insert walked past the join gates SCAN-691,
-- SCAN-750 and SCAN-774 closed in the app.
--
-- "crew_completions: crew+ insert own" let any member insert a completion with any task_id,
-- zaps_earned and verified_at; trg_after_crew_completion then credits zap_transactions for
-- NEW.zaps_earned. SCAN-687 locked the log_crew_completion_atomic RPC to service_role, but the
-- table door stayed open, so Zaps could be minted without limit.
--
-- Every writer of both tables runs under the service role (lib/circles/join.ts, the admin actions,
-- the demo engine, logCompletion through the RPC), so neither policy serves a caller. Dropping them
-- leaves INSERT denied for anon and authenticated. Reads and the other commands are unchanged.
-- Proved by supabase/tests/member_direct_inserts_denied.test.sql.

drop policy if exists "memberships: crew+ join own" on public.memberships;
drop policy if exists "crew_completions: crew+ insert own" on public.crew_completions;
