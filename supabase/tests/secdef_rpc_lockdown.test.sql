-- pgTAP regression guard: SECURITY DEFINER functions that mutate platform state and have NO
-- internal authorization check must NEVER be EXECUTE-able by anon or authenticated (only the
-- service_role admin client may call them). These four were found anon-executable in the meta-scan
-- security sweep (migration 20261005000000) — a SECURITY DEFINER function bypasses RLS, and
-- PostgREST exposes every public function as an RPC, so an anon grant = an open write endpoint.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(8);

-- reset_season(): platform-wide season rollover.
select is(has_function_privilege('anon', 'public.reset_season()', 'execute'), false,
  'anon cannot execute reset_season');
select is(has_function_privilege('authenticated', 'public.reset_season()', 'execute'), false,
  'authenticated cannot execute reset_season');

-- adjust_ticket_sold(uuid, int): event ticket inventory.
select is(has_function_privilege('anon', 'public.adjust_ticket_sold(uuid, integer)', 'execute'), false,
  'anon cannot execute adjust_ticket_sold');
select is(has_function_privilege('authenticated', 'public.adjust_ticket_sold(uuid, integer)', 'execute'), false,
  'authenticated cannot execute adjust_ticket_sold');

-- set_node_geo(...): node geofence.
select is(has_function_privilege('anon', 'public.set_node_geo(uuid, double precision, double precision, integer)', 'execute'), false,
  'anon cannot execute set_node_geo');
select is(has_function_privilege('authenticated', 'public.set_node_geo(uuid, double precision, double precision, integer)', 'execute'), false,
  'authenticated cannot execute set_node_geo');

-- refresh_member_engagement_scores(): expensive full recompute (DoS surface).
select is(has_function_privilege('anon', 'public.refresh_member_engagement_scores()', 'execute'), false,
  'anon cannot execute refresh_member_engagement_scores');
select is(has_function_privilege('authenticated', 'public.refresh_member_engagement_scores()', 'execute'), false,
  'authenticated cannot execute refresh_member_engagement_scores');

select * from finish();
rollback;
