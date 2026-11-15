-- Real Supabase/pgTAP acceptance for the server-only growth aggregate.
-- Complements the isolated cohort fixture probe; no live data is modified.
begin;
select plan(12);
select has_function('public', 'analytics_growth_snapshot', array['integer']::name[], 'growth snapshot RPC exists');
select is(has_function_privilege('anon', 'public.analytics_growth_snapshot(integer)', 'execute'), false, 'anonymous cannot execute platform-wide analytics');
select is(has_function_privilege('authenticated', 'public.analytics_growth_snapshot(integer)', 'execute'), false, 'members cannot execute platform-wide analytics');
select is(has_function_privilege('service_role', 'public.analytics_growth_snapshot(integer)', 'execute'), true, 'trusted server can execute analytics');
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.analytics_growth_snapshot()$$, '42501', 'not authorized to read growth analytics', 'execution without trusted JWT role fails closed');
set local role anon;
select throws_ok($$select public.analytics_growth_snapshot()$$, '42501', null, 'anonymous access fails at database privilege boundary');
reset role;
set local role authenticated;
select throws_ok($$select public.analytics_growth_snapshot()$$, '42501', null, 'authenticated access fails at database privilege boundary');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select lives_ok($$select public.analytics_growth_snapshot()$$, 'service role evaluates real schema and auth helpers');
select is((public.analytics_growth_snapshot(-4)->>'windowDays')::int, 1, 'window is clamped to one day minimum');
select is((public.analytics_growth_snapshot(900)->>'windowDays')::int, 90, 'window is clamped to ninety days maximum');
select is((public.analytics_growth_snapshot(null)->>'windowDays')::int, 30, 'null window uses thirty days');
select ok(
  public.analytics_growth_snapshot() ?& array['computedAt', 'measurement', 'builder', 'campaigns', 'leadCampaigns', 'weeklyAttendance']
  and jsonb_array_length(public.analytics_growth_snapshot()->'builder') = 6
  and jsonb_array_length(public.analytics_growth_snapshot()->'weeklyAttendance') = 8,
  'real schema produces complete aggregate arrays and coverage evidence'
);
reset role;
select * from finish();
rollback;
