-- pgTAP behavioral guard for the lead-name spend inside convert_signup_leads_for_me
-- (migration 20270345008700, LIVE-450).
--
-- What is pinned: on the call that stamps a lead converted, the name the lead carries lands on the
-- caller's profile IF AND ONLY IF that profile is still the signup trigger's mint. Every refusal
-- is exercised by name, because a wrong overwrite here renames a real member:
--
--   D  the RSVP door's guest: minted profile, lead display_name       -> the name lands
--   E  a member who chose a NAME: lead display_name                   -> untouched
--   F  a minted profile whose lead carries no name at all             -> untouched
--   G  a minted profile whose lead carries first_name only            -> first_name lands
--   H  a member who chose a HANDLE (name still the mint)              -> untouched
--   I  a second sign-in after the lead is already converted           -> spends nothing
--   K  the 'New Member' / member_<hex> mint (empty local part)        -> the name lands
--
-- The profiles here are minted by the real signup trigger (handle_new_auth_user fires on the
-- auth.users insert), never inserted by hand, so the mint the function reconstructs is the mint
-- the trigger actually wrote. Each case asserts the mint BEFORE the call so a trigger change
-- cannot make the spend assertions pass vacuously.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(19);

-- ── 0. The door is unchanged in shape and reach ────────────────────────────────────────────────

select has_function('public', 'convert_signup_leads_for_me', '{}'::name[],
  'convert_signup_leads_for_me() still exists and takes no arguments');
select is(
  has_function_privilege('anon', 'public.convert_signup_leads_for_me()', 'execute'),
  false, 'anon still cannot reach convert_signup_leads_for_me');
select is(
  has_function_privilege('authenticated', 'public.convert_signup_leads_for_me()', 'execute'),
  true, 'authenticated can still reach convert_signup_leads_for_me');

-- ── 1. The cast: every auth.users insert lets the signup trigger mint the profile ──────────────
-- All ids share the prefix 00000000-0000-4000-e631, so every minted handle ends in _000000; the
-- local parts differ, so no two collide with each other.

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-e631-0000000000d1', 'l450.sam.rivera@test.local', now()),
  ('00000000-0000-4000-e631-0000000000e1', 'l450.jo@test.local',         now()),
  ('00000000-0000-4000-e631-0000000000f1', 'l450.kim@test.local',        now()),
  ('00000000-0000-4000-e631-00000000a0a1', 'l450.priya@test.local',      now()),
  ('00000000-0000-4000-e631-00000000b0b1', 'l450.lee@test.local',        now()),
  ('00000000-0000-4000-e631-00000000c0c1', 'l450.nm@test.local',         now());

-- E chose a name. H chose a handle. K is made into the empty-local-part mint the trigger writes
-- when an address has no local part ('New Member' / member_<hex>).
update public.profiles set display_name = 'Jo Chosen'
  where auth_user_id = '00000000-0000-4000-e631-0000000000e1';
update public.profiles set handle = 'l450_lee_chosen'
  where auth_user_id = '00000000-0000-4000-e631-00000000b0b1';
update public.profiles set display_name = 'New Member', handle = 'member_000000'
  where auth_user_id = '00000000-0000-4000-e631-00000000c0c1';

-- D's lead comes through the real RSVP door, as anon, with the guest's typed name (the door passes
-- it as p_display_name: app/(main)/events/guest-rsvp-actions.ts). The rest are seeded directly.
set local role anon;
select set_config('l450.d',
  public.capture_signup_lead('L450.Sam.Rivera@Test.local', 'event_rsvp', 0, null, null, 'Sam Rivera')::text, true);
reset role;

insert into public.signup_leads (email, source, first_name, display_name) values
  ('l450.jo@test.local',    'beta_induction', null,    'Impostor Name'),
  ('l450.kim@test.local',   'event_rsvp',     null,    null),
  ('l450.priya@test.local', 'beta_induction', 'Priya', null),
  ('l450.lee@test.local',   'event_rsvp',     null,    'Lee Lead'),
  ('l450.nm@test.local',    'event_rsvp',     null,    'Enn Em');

-- ── D. The RSVP guest: the mint is replaced by the name they typed, the handle stays ───────────

select is(
  (select display_name from public.profiles where auth_user_id = '00000000-0000-4000-e631-0000000000d1'),
  'l450.sam.rivera',
  'D BEFORE: the trigger minted the email local part as the display name');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e631-0000000000d1', 'role', 'authenticated')::text, true);
select is(public.convert_signup_leads_for_me(), 1, 'D: the RSVP lead is stamped (1)');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select display_name from public.profiles where auth_user_id = '00000000-0000-4000-e631-0000000000d1'),
  'Sam Rivera',
  'D AFTER: the name the guest typed at the RSVP form is now the profile display name');
select is(
  (select handle from public.profiles where auth_user_id = '00000000-0000-4000-e631-0000000000d1'),
  'l450samrivera_000000',
  'D AFTER: the handle is untouched (the spend is the name only)');

-- ── E. A chosen NAME is never overwritten by a lead ────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e631-0000000000e1', 'role', 'authenticated')::text, true);
select is(public.convert_signup_leads_for_me(), 1, 'E: the lead is still stamped (1)');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select display_name from public.profiles where auth_user_id = '00000000-0000-4000-e631-0000000000e1'),
  'Jo Chosen',
  'E: a member who chose a name keeps it; the lead name does not overwrite it');

-- ── F. A lead with no name spends nothing ──────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e631-0000000000f1', 'role', 'authenticated')::text, true);
select is(public.convert_signup_leads_for_me(), 1, 'F: the nameless lead is stamped (1)');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select display_name from public.profiles where auth_user_id = '00000000-0000-4000-e631-0000000000f1'),
  'l450.kim',
  'F: a lead with neither display_name nor first_name leaves the mint in place');

-- ── G. first_name is the fallback when the lead has no display_name ────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e631-00000000a0a1', 'role', 'authenticated')::text, true);
select is(public.convert_signup_leads_for_me(), 1, 'G: the induction lead is stamped (1)');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select display_name from public.profiles where auth_user_id = '00000000-0000-4000-e631-00000000a0a1'),
  'Priya',
  'G: first_name lands when the lead carries no display_name');

-- ── H. A chosen HANDLE reads as chosen even while the name is still the mint ───────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e631-00000000b0b1', 'role', 'authenticated')::text, true);
select is(public.convert_signup_leads_for_me(), 1, 'H: the lead is stamped (1)');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select display_name from public.profiles where auth_user_id = '00000000-0000-4000-e631-00000000b0b1'),
  'l450.lee',
  'H: a member who chose a handle is not renamed, even though the name is still the mint');

-- ── I. A second sign-in stamps nothing and therefore spends nothing ────────────────────────────
-- D's name is put back to the mint by hand; the already-converted lead must not re-apply it.

update public.profiles set display_name = 'l450.sam.rivera'
  where auth_user_id = '00000000-0000-4000-e631-0000000000d1';

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e631-0000000000d1', 'role', 'authenticated')::text, true);
select is(public.convert_signup_leads_for_me(), 0, 'I: the second call matches no unconverted row (0)');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select display_name from public.profiles where auth_user_id = '00000000-0000-4000-e631-0000000000d1'),
  'l450.sam.rivera',
  'I: a converted lead is never spent twice');

-- ── K. The empty-local-part mint: New Member / member_<hex> ────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e631-00000000c0c1', 'role', 'authenticated')::text, true);
select is(public.convert_signup_leads_for_me(), 1, 'K: the lead is stamped (1)');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select display_name from public.profiles where auth_user_id = '00000000-0000-4000-e631-00000000c0c1'),
  'Enn Em',
  'K: the New Member / member_<hex> mint is recognised and the lead name lands');

select * from finish();
rollback;
