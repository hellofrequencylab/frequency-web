-- pgTAP behavioral guard for the Create a Space draft table (migration 20270346028600, LIVE-1967, ADR-1933).
--
-- Three things are pinned here.
--
--   1. THE POSTURE. create_space_drafts is service-role only: RLS on, no policy, and anon / authenticated hold no
--      privilege on it at all. The row carries a visitor's draft and address, so a stranger must not be able to
--      read, write or even count it from the browser.
--
--   2. THE CEILINGS. A draft past 8KB, a token hash that is not sha256 hex, a step outside the builder's range
--      and an unparseable zone are refused by the table, not only by the app, because the writer is a public
--      action. purge_after lands 90 days out by default, so nothing here lives forever.
--
--   3. THE CASE-EXPRESSION TRAP, again. capture_signup_lead keeps its own copy of the allowed sources and REWRITES
--      an unknown one to beta_induction. The CHECK and that case line were widened together for create_space; the
--      two assertions below fail loudly if either half is ever narrowed alone.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(18);

-- ── 1. Posture ──────────────────────────────────────────────────────────────────────────────────

select has_table('public', 'create_space_drafts', 'create_space_drafts exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.create_space_drafts'::regclass),
  true, 'RLS is on');
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'create_space_drafts'),
  0::bigint, 'and there is no policy: deny-all by design (scripts/rls-deny-all.txt)');
select is(has_table_privilege('anon', 'public.create_space_drafts', 'select'), false, 'anon cannot select');
select is(has_table_privilege('anon', 'public.create_space_drafts', 'insert'), false, 'anon cannot insert');
select is(has_table_privilege('authenticated', 'public.create_space_drafts', 'select'), false, 'authenticated cannot select');
select is(has_table_privilege('authenticated', 'public.create_space_drafts', 'update'), false, 'authenticated cannot update');

-- ── 1b. The claim log (20270346028700) wears the same posture ─────────────────────────────────

select has_table('public', 'create_space_draft_email_log', 'create_space_draft_email_log exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.create_space_draft_email_log'::regclass),
  true, 'the log has RLS on');
select is(has_table_privilege('anon', 'public.create_space_draft_email_log', 'select'), false, 'anon cannot read the log');
select is(has_table_privilege('authenticated', 'public.create_space_draft_email_log', 'insert'), false, 'authenticated cannot write the log');

-- ── 2. Ceilings ─────────────────────────────────────────────────────────────────────────────────

select lives_ok(
  $q$insert into public.create_space_drafts (token_hash, email, draft, tz, step_reached)
     values (repeat('a', 64), 'draft@test.local', '{"name":"Limewell"}'::jsonb, 'Europe/Lisbon', 2)$q$,
  'a well-formed draft row inserts');
select ok(
  (select purge_after between now() + interval '89 days' and now() + interval '91 days'
     from public.create_space_drafts where token_hash = repeat('a', 64)),
  'purge_after defaults to 90 days out');
select throws_ok(
  $q$insert into public.create_space_drafts (token_hash, email, draft)
     values (repeat('b', 64), 'big@test.local', ('{"offer":"' || repeat('x', 9000) || '"}')::jsonb)$q$,
  '23514', null, 'a draft past 8KB is refused by the table');
select throws_ok(
  $q$insert into public.create_space_drafts (token_hash, email) values ('not-a-hash', 'hash@test.local')$q$,
  '23514', null, 'a token hash that is not sha256 hex is refused');
select throws_ok(
  $q$insert into public.create_space_drafts (token_hash, email, step_reached) values (repeat('c', 64), 'step@test.local', 12)$q$,
  '23514', null, 'a step outside the builder range is refused');

-- ── 3. The source joins the funnel, CHECK and case line together ────────────────────────────────

set local role anon;
select set_config('csd.lead',
  public.capture_signup_lead('Draft-Lead@Test.local', 'create_space', 2, null, null, 'Sam Rivera', 'limewell',
    '{"flow":"create-a-space","personas":["practitioner"]}'::jsonb)::text, true);
reset role;

select is(
  (select source from public.signup_leads where id = (current_setting('csd.lead')::jsonb ->> 'id')::uuid),
  'create_space',
  'REGRESSION GUARD: p_source => create_space is STORED as create_space, not rewritten to beta_induction');
select is(
  (select payload ->> 'flow' from public.signup_leads where id = (current_setting('csd.lead')::jsonb ->> 'id')::uuid),
  'create-a-space',
  'and the builder payload rides along');

select * from finish();
rollback;
