-- pgTAP behavioral guard for capture_signup_lead after 20270346064000 (SCAN-1246).
--
-- Before that migration a repeat capture of a known address ROTATED the row's claim token and handed the new
-- one back, so anyone who knew an address took over that lead row. This file pins the replacement rule:
--
--   · a repeat capture names the same row and answers in the same fixed {id, claim_token} shape;
--   · the stored token hash is still the FIRST token's;
--   · the later caller's token opens nothing, and the first holder's still opens the row;
--   · the stored name and handle win; a blank is still filled in;
--   · the furthest step still wins, the first source stays, and the payload still merges;
--   · a row from before the token existed (NULL hash) is neither claimed nor renamed by a capture.
--
-- Every anon call is made AS anon, because that is the role the defect was reachable from. Values are parked
-- in transaction-local GUCs, the same idiom signup_lead_claim_token.test.sql uses.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(12);

set local role anon;
select set_config('s1246.a',
  public.capture_signup_lead('Holder@S1246.test', 'beta_induction', 1, null, null, 'Real Name', 'real_handle', '{"k": "first"}'::jsonb)::text,
  true);
select set_config('s1246.b',
  public.capture_signup_lead('holder@s1246.test', 'feature_funnel', 4, 'Imp', 'Ostor', 'Impostor', 'imp', '{"k": "second", "n": 1}'::jsonb)::text,
  true);
reset role;

select is(
  current_setting('s1246.b')::jsonb ->> 'id',
  current_setting('s1246.a')::jsonb ->> 'id',
  'a repeat capture names the same row'
);
select is(
  array(select jsonb_object_keys(current_setting('s1246.b')::jsonb) order by 1),
  array['claim_token', 'id'],
  'and answers in exactly the same {id, claim_token} shape'
);
select isnt(
  current_setting('s1246.b')::jsonb ->> 'claim_token',
  current_setting('s1246.a')::jsonb ->> 'claim_token',
  'the repeat reply does not echo the holder''s token'
);
select is(
  (select claim_token_hash from public.signup_leads where id = (current_setting('s1246.a')::jsonb ->> 'id')::uuid),
  encode(extensions.digest(current_setting('s1246.a')::jsonb ->> 'claim_token', 'sha256'), 'hex'),
  'NOT ROTATED: the row still stores the hash of the FIRST token'
);
select is(
  (select row(display_name, handle, first_name, last_name)::text from public.signup_leads
    where id = (current_setting('s1246.a')::jsonb ->> 'id')::uuid),
  row('Real Name'::text, 'real_handle'::text, 'Imp'::text, 'Ostor'::text)::text,
  'the stored name and handle win; the blank first and last name are filled in'
);
select is(
  (select row(step_reached::int, source, payload)::text from public.signup_leads
    where id = (current_setting('s1246.a')::jsonb ->> 'id')::uuid),
  row(4, 'beta_induction'::text, '{"k": "second", "n": 1}'::jsonb)::text,
  'furthest step wins, the first source stays, the payload still merges'
);

set local role anon;
select is(
  public.update_signup_lead(
    (current_setting('s1246.b')::jsonb ->> 'id')::uuid, (current_setting('s1246.b')::jsonb ->> 'claim_token')::uuid,
    9, null, null, 'Defaced', 'defaced', '{"x": 1}'::jsonb),
  false,
  'LATER CALLER: the token a repeat capture returned opens nothing'
);
select is(
  public.update_signup_lead(
    (current_setting('s1246.a')::jsonb ->> 'id')::uuid, (current_setting('s1246.a')::jsonb ->> 'claim_token')::uuid,
    5, null, null, 'Holder Rename', null, '{}'::jsonb),
  true,
  'FIRST HOLDER: the original token still opens the row'
);
reset role;

select is(
  (select row(display_name, handle, step_reached::int)::text from public.signup_leads
    where id = (current_setting('s1246.a')::jsonb ->> 'id')::uuid),
  row('Holder Rename'::text, 'real_handle'::text, 5)::text,
  'only the holder''s update landed'
);

-- ── A pre-token row is not claimed by a capture ─────────────────────────────────────────────────
insert into public.signup_leads (id, email, source, display_name)
values ('00000000-0000-4000-e746-000000000001', 'legacy@s1246.test', 'beta_induction', 'Legacy Name');

set local role anon;
select set_config('s1246.c',
  public.capture_signup_lead('legacy@s1246.test', 'beta_induction', 1, null, null, 'Taker')::text, true);
select is(
  public.update_signup_lead(
    '00000000-0000-4000-e746-000000000001', (current_setting('s1246.c')::jsonb ->> 'claim_token')::uuid,
    2, null, null, 'Defaced Legacy', null, '{}'::jsonb),
  false,
  'LEGACY ROW: the token a capture returned for it opens nothing'
);
reset role;

select is(
  (select claim_token_hash from public.signup_leads where id = '00000000-0000-4000-e746-000000000001'),
  null,
  'the legacy row still has no token hash'
);
select is(
  (select display_name from public.signup_leads where id = '00000000-0000-4000-e746-000000000001'),
  'Legacy Name',
  'and keeps its name'
);

select * from finish();
rollback;
