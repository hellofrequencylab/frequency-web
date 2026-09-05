-- pgTAP behavioral guard for the signup_leads claim token (migration 20270345000610, scan2 L7-6).
--
-- Before that migration, update_signup_lead (anon-callable) and mark_signup_lead_converted
-- (authenticated) took a signup_leads.id as their whole key, so anyone who picked an id up could
-- rewrite that lead. This file pins the replacement rule:
--
--   · capture_signup_lead hands back {id, claim_token}, the same shape for a new and a known address;
--   · the RIGHT token updates the row and returns true;
--   · a WRONG token changes nothing and returns false;
--   · a MISSING token changes nothing and returns false;
--   · a row captured BEFORE the token existed (claim_token_hash null) is writable by nobody;
--   · the old unproven signatures are gone, not left standing as overloads;
--   · mark_signup_lead_converted needs BOTH the auth.uid() profile ownership and the token.
--
-- Every anon call is made AS anon, because that is the role the defect was reachable from.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(19);

-- ── 0. The old doors are closed, the new ones are open to the intended roles only ───────────────
select hasnt_function('public', 'update_signup_lead',
  array['uuid', 'integer', 'text', 'text', 'text', 'text', 'jsonb'],
  'the token-less update_signup_lead(uuid, integer, ...) no longer exists');
select hasnt_function('public', 'mark_signup_lead_converted', array['uuid', 'uuid'],
  'the token-less mark_signup_lead_converted(uuid, uuid) no longer exists');
select has_function('public', 'update_signup_lead',
  array['uuid', 'uuid', 'integer', 'text', 'text', 'text', 'text', 'jsonb'],
  'update_signup_lead now takes the claim token');
select is(
  has_function_privilege('anon', 'public.update_signup_lead(uuid, uuid, integer, text, text, text, text, jsonb)', 'execute'),
  true, 'anon can still reach update_signup_lead (the funnel runs signed out)');
select is(
  has_function_privilege('anon', 'public.mark_signup_lead_converted(uuid, uuid, uuid)', 'execute'),
  false, 'anon cannot reach mark_signup_lead_converted');
select is(
  has_function_privilege('authenticated', 'public.mark_signup_lead_converted(uuid, uuid, uuid)', 'execute'),
  true, 'authenticated can reach mark_signup_lead_converted');

-- ── 1. Capture, as anon: the return shape and the stored hash ───────────────────────────────────
-- Parked in a transaction-local GUC rather than a temp table: anon holds no TEMP privilege it can be
-- relied on to have, and set_config() is open to every role. is_local = true scopes it to this
-- transaction, which the closing rollback ends.
set local role anon;
select set_config('l76.lead',
  public.capture_signup_lead('Lead@Example.com', 'beta_induction', 1, null, null, 'Original Name')::text,
  true);
reset role;

select is(
  array(select jsonb_object_keys(current_setting('l76.lead')::jsonb) order by 1),
  array['claim_token', 'id'],
  'capture_signup_lead returns exactly {id, claim_token}'
);
select is(
  (select claim_token_hash from public.signup_leads where id = (current_setting('l76.lead')::jsonb ->> 'id')::uuid),
  encode(extensions.digest(current_setting('l76.lead')::jsonb ->> 'claim_token', 'sha256'), 'hex'),
  'the row stores the SHA-256 hex of the token it handed back, never the token itself'
);

-- ── 2. update_signup_lead: right token, wrong token, missing token ──────────────────────────────
set local role anon;

select is(
  public.update_signup_lead(
    (current_setting('l76.lead')::jsonb ->> 'id')::uuid, (current_setting('l76.lead')::jsonb ->> 'claim_token')::uuid,
    3, null, null, 'Updated By Owner', 'owner_handle', '{"beat": 3}'::jsonb),
  true,
  'RIGHT TOKEN: the update returns true'
);
select is(
  public.update_signup_lead(
    (current_setting('l76.lead')::jsonb ->> 'id')::uuid, gen_random_uuid(),
    9, null, null, 'Defaced', 'defaced', '{"x": 1}'::jsonb),
  false,
  'WRONG TOKEN: the update returns false'
);
select is(
  public.update_signup_lead(
    (current_setting('l76.lead')::jsonb ->> 'id')::uuid, null,
    9, null, null, 'Defaced', 'defaced', '{"x": 1}'::jsonb),
  false,
  'MISSING TOKEN: the update returns false'
);

reset role;

select is(
  (select display_name from public.signup_leads where id = (current_setting('l76.lead')::jsonb ->> 'id')::uuid),
  'Updated By Owner',
  'the right token changed the row, and neither bad call touched it afterwards'
);
select is(
  (select step_reached::int from public.signup_leads where id = (current_setting('l76.lead')::jsonb ->> 'id')::uuid),
  3,
  'step_reached carries the owner update (3), not the defacement (9)'
);
select is(
  (select payload from public.signup_leads where id = (current_setting('l76.lead')::jsonb ->> 'id')::uuid),
  '{"beat": 3}'::jsonb,
  'payload carries the owner merge only'
);

-- ── 3. A pre-token row is writable by nobody through this door ──────────────────────────────────
insert into public.signup_leads (id, email, source, display_name)
values ('00000000-0000-4000-e600-000000000001', 'legacy@example.com', 'beta_induction', 'Legacy Name');

set local role anon;
select is(
  public.update_signup_lead('00000000-0000-4000-e600-000000000001', gen_random_uuid(),
    2, null, null, 'Defaced Legacy', null, '{}'::jsonb),
  false,
  'LEGACY ROW: no token can match a NULL hash, so the update returns false'
);
reset role;
select is(
  (select display_name from public.signup_leads where id = '00000000-0000-4000-e600-000000000001'),
  'Legacy Name',
  'and the legacy row is unchanged'
);

-- ── 4. mark_signup_lead_converted: profile ownership AND the token ──────────────────────────────
-- profiles.auth_user_id references auth.users in the CI database (the first run of this file proved
-- it: profiles_auth_user_id_fkey), so the session user is seeded there first, as the sibling tests do.
insert into auth.users (id, email) values
  ('00000000-0000-4000-e600-0000000000a1', 'l76-converter@test.local');
insert into public.profiles (id, display_name, handle, auth_user_id) values
  ('00000000-0000-4000-e600-0000000000c1', 'Converter', 'l76_converter', '00000000-0000-4000-e600-0000000000a1');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e600-0000000000a1', 'role', 'authenticated')::text, true);

select is(
  public.mark_signup_lead_converted(
    (current_setting('l76.lead')::jsonb ->> 'id')::uuid, '00000000-0000-4000-e600-0000000000c1', gen_random_uuid()),
  false,
  'CONVERT, WRONG TOKEN: returns false even for the profile owner'
);
select is(
  public.mark_signup_lead_converted(
    (current_setting('l76.lead')::jsonb ->> 'id')::uuid, '00000000-0000-4000-e600-0000000000c1',
    (current_setting('l76.lead')::jsonb ->> 'claim_token')::uuid),
  true,
  'CONVERT, RIGHT TOKEN + own profile: returns true'
);

reset role;

select is(
  (select converted_profile_id from public.signup_leads where id = (current_setting('l76.lead')::jsonb ->> 'id')::uuid),
  '00000000-0000-4000-e600-0000000000c1'::uuid,
  'the lead is stamped converted to the owning profile'
);

select * from finish();
rollback;
