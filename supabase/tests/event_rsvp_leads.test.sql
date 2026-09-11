-- pgTAP behavioral guard for the event RSVP lead path (migration 20270345003300).
--
-- Two things are pinned here.
--
--   1. THE CASE-EXPRESSION TRAP. capture_signup_lead keeps its own copy of the allowed source list
--      in its body, and that copy does not reject an unknown source, it silently REWRITES it to
--      'beta_induction'. Widening only signup_leads_source_check would therefore have landed every
--      event lead as a beta lead with nothing anywhere raising. So the first two assertions are
--      "p_source => 'event_rsvp' is STORED as event_rsvp" and "an unknown source still falls back",
--      which together fail loudly if either half of the pair is widened without the other.
--
--   2. convert_signup_leads_for_me(), the conversion door proved by AUTHENTICATION rather than by
--      the claim token mark_signup_lead_converted requires. It takes no arguments, reads the
--      caller's confirmed address out of auth.users server-side, returns 0 and writes nothing for a
--      caller with no profile / no proven address / an unconfirmed one, stamps once, and is
--      deliberately source-blind.
--
-- Every capture is made AS anon, because that is the role the funnel front door runs as.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(17);

-- ── 0. The new door exists and is open to exactly one role ──────────────────────────────────────

select has_function('public', 'convert_signup_leads_for_me', '{}'::name[],
  'convert_signup_leads_for_me() exists and takes no arguments');
select is(
  has_function_privilege('anon', 'public.convert_signup_leads_for_me()', 'execute'),
  false, 'anon cannot reach convert_signup_leads_for_me (it has no proven address to match on)');
select is(
  has_function_privilege('authenticated', 'public.convert_signup_leads_for_me()', 'execute'),
  true, 'authenticated can reach convert_signup_leads_for_me');

-- ── 1. source: the CHECK and the case expression were widened TOGETHER ──────────────────────────

select lives_ok(
  $q$insert into public.signup_leads (email, source) values ('direct-evt@test.local', 'event_rsvp')$q$,
  'signup_leads_source_check accepts a direct event_rsvp insert'
);

-- Parked in transaction-local GUCs rather than temp tables: anon holds no TEMP privilege it can be
-- relied on to have, and set_config() is open to every role (same idiom as signup_lead_claim_token).
set local role anon;
select set_config('erl.lead',
  public.capture_signup_lead('A-Convert@Test.local', 'event_rsvp', 2)::text, true);
select set_config('erl.weird',
  public.capture_signup_lead('weird@test.local', 'made_up_source', 1)::text, true);
reset role;

select is(
  (select source from public.signup_leads where id = (current_setting('erl.lead')::jsonb ->> 'id')::uuid),
  'event_rsvp',
  'REGRESSION GUARD: p_source => event_rsvp is STORED as event_rsvp, not rewritten to beta_induction'
);
select is(
  (select source from public.signup_leads where id = (current_setting('erl.weird')::jsonb ->> 'id')::uuid),
  'beta_induction',
  'an unknown source still falls back to beta_induction rather than raising'
);

-- ── 2. The cast of callers ──────────────────────────────────────────────────────────────────────
-- profiles.auth_user_id references auth.users, so each session user is seeded there first.
--   A  confirmed address, and it is the address the event lead above was captured under
--   B  confirmed address, carrying a beta_induction lead (the source-blindness case)
--   C  UNCONFIRMED address, carrying an event_rsvp lead that must stay untouched

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-e630-0000000000a1', 'a-convert@test.local',     now()),
  ('00000000-0000-4000-e630-0000000000a2', 'b-beta@test.local',        now()),
  ('00000000-0000-4000-e630-0000000000a3', 'c-unconfirmed@test.local', null);

insert into public.profiles (id, display_name, handle, auth_user_id) values
  ('00000000-0000-4000-e630-0000000000c1', 'Converter A', 'erl_a', '00000000-0000-4000-e630-0000000000a1'),
  ('00000000-0000-4000-e630-0000000000c2', 'Converter B', 'erl_b', '00000000-0000-4000-e630-0000000000a2'),
  ('00000000-0000-4000-e630-0000000000c3', 'Converter C', 'erl_c', '00000000-0000-4000-e630-0000000000a3');

insert into public.signup_leads (email, source) values
  ('b-beta@test.local',        'beta_induction'),
  ('c-unconfirmed@test.local', 'event_rsvp');

-- ── 3. No proof, no stamp: unauthenticated, then a signed-in stranger with no profile ───────────

set local role authenticated;
select set_config('request.jwt.claims', '', true);
select is(
  public.convert_signup_leads_for_me(), 0,
  'UNAUTHENTICATED (auth.uid() null): returns 0'
);

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e630-00000000dead', 'role', 'authenticated')::text, true);
select is(
  public.convert_signup_leads_for_me(), 0,
  'PROFILE-LESS caller: returns 0'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select converted_at from public.signup_leads where id = (current_setting('erl.lead')::jsonb ->> 'id')::uuid),
  null::timestamptz,
  'and neither call stamped anything'
);

-- ── 4. An UNCONFIRMED address is a claim, not a proof ───────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e630-0000000000a3', 'role', 'authenticated')::text, true);
select is(
  public.convert_signup_leads_for_me(), 0,
  'UNCONFIRMED address: returns 0 even though a lead for that address exists'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select converted_at from public.signup_leads where lower(email) = 'c-unconfirmed@test.local'),
  null::timestamptz,
  'and that lead is still unconverted'
);

-- ── 5. The owner converts their own event lead ──────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e630-0000000000a1', 'role', 'authenticated')::text, true);
select is(
  public.convert_signup_leads_for_me(), 1,
  'OWNER, confirmed address: stamps exactly the one row that matches it'
);
reset role;

select is(
  (select converted_profile_id from public.signup_leads where id = (current_setting('erl.lead')::jsonb ->> 'id')::uuid),
  '00000000-0000-4000-e630-0000000000c1'::uuid,
  'the lead is stamped to the caller''s own profile'
);
select isnt(
  (select converted_at from public.signup_leads where id = (current_setting('erl.lead')::jsonb ->> 'id')::uuid),
  null::timestamptz,
  'and converted_at is set'
);

-- ── 6. Idempotent: a second call stamps nothing and cannot move the timestamp ───────────────────

select set_config('erl.stamped',
  (select converted_at from public.signup_leads where id = (current_setting('erl.lead')::jsonb ->> 'id')::uuid)::text,
  true);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e630-0000000000a1', 'role', 'authenticated')::text, true);
select is(
  public.convert_signup_leads_for_me(), 0,
  'IDEMPOTENT: the second call matches no unconverted row and returns 0'
);
reset role;

select is(
  (select converted_at from public.signup_leads where id = (current_setting('erl.lead')::jsonb ->> 'id')::uuid),
  current_setting('erl.stamped')::timestamptz,
  'and converted_at did not move: the FIRST conversion is the one that counts'
);

-- ── 7. Source-blind on purpose: the same person's beta lead converts too ────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e630-0000000000a2', 'role', 'authenticated')::text, true);
select is(
  public.convert_signup_leads_for_me(), 1,
  'SOURCE-BLIND: a beta_induction lead for the same proven address converts too, because it is the same person'
);
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
