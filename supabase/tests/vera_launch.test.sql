-- Vera guided launch tables (20270346026000_vera_launch.sql, LIVE-1550).
--
-- Proved here, against a real database with the migration applied:
--   1. SHAPE: all five tables have RLS on; a signed-out caller holds no privilege on any of them; a
--      signed-in caller holds none on the reminder log, cannot delete a launch and can never edit or
--      delete a consent attestation.
--   2. ONE ACTIVE LAUNCH PER OWNER, and a finished one frees the slot.
--   3. DOUBLE-CONFIRM CANCEL: a launch cannot carry cancelled_at without cancel_requested_at.
--   4. OWNER-ONLY: a stranger reads no launch, source, fact or attestation, and cannot plant one on
--      someone else's launch.
--   5. NO INVENTED FACTS: a fact with no verbatim snippet or no origin is refused, and removing a
--      source removes its facts.
--
-- One transaction, rolled back: nothing persists. Fixture style follows circle_privacy.test.sql,
-- including the auto-provisioned-profile cleanup.

begin;
select plan(31);

-- ── Fixture (seeded as postgres, which RLS does not bind) ────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a200-000000000001', 'launch-owner@test.local'),
  ('00000000-0000-4000-a200-000000000002', 'launch-stranger@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b200-000000000001', '00000000-0000-4000-a200-000000000001', 'Launch Owner', 'launch-owner'),
  ('00000000-0000-4000-b200-000000000002', '00000000-0000-4000-a200-000000000002', 'Launch Stranger', 'launch-stranger');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row, so each seeded user has TWO
-- profiles and get_my_profile_id()'s scalar subquery would error. Keep only the fixed ids.
delete from public.profiles
where auth_user_id in ('00000000-0000-4000-a200-000000000001', '00000000-0000-4000-a200-000000000002')
  and id not in ('00000000-0000-4000-b200-000000000001', '00000000-0000-4000-b200-000000000002');

insert into public.space_launch (id, owner_id, space_id, steps) values
  ('00000000-0000-4000-d200-000000000002', '00000000-0000-4000-b200-000000000002', null, '{}'::jsonb);

-- ── 1. SHAPE ─────────────────────────────────────────────────────────────────────────────────────

select is(
  (select count(*)::int from pg_class
    where oid in ('public.space_launch'::regclass, 'public.launch_sources'::regclass, 'public.launch_facts'::regclass,
                  'public.launch_list_attestations'::regclass, 'public.launch_email_log'::regclass)
      and relrowsecurity),
  5,
  'all five Launch tables have RLS enabled'
);
select is(
  (select count(*)::int from unnest(array['space_launch','launch_sources','launch_facts','launch_list_attestations','launch_email_log']) t
    where has_table_privilege('anon', 'public.' || t, 'select')
       or has_table_privilege('anon', 'public.' || t, 'insert')
       or has_table_privilege('anon', 'public.' || t, 'update')
       or has_table_privilege('anon', 'public.' || t, 'delete')),
  0,
  'a signed-out caller holds no privilege on any Launch table'
);
select is(
  has_table_privilege('authenticated', 'public.launch_email_log', 'select')
    or has_table_privilege('authenticated', 'public.launch_email_log', 'insert'),
  false,
  'a signed-in caller holds no privilege on the reminder log'
);
select is(
  has_table_privilege('authenticated', 'public.space_launch', 'delete'),
  false,
  'a signed-in caller cannot delete a launch'
);
select is(
  has_table_privilege('authenticated', 'public.launch_list_attestations', 'update')
    or has_table_privilege('authenticated', 'public.launch_list_attestations', 'delete'),
  false,
  'a consent attestation is append-only for its owner'
);

-- ── 2 to 5 as the owner ──────────────────────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a200-000000000001')::text, true);

select lives_ok(
  $$ insert into public.space_launch (id, owner_id, niche, intents)
     values ('00000000-0000-4000-d200-000000000001', '00000000-0000-4000-b200-000000000001', 'coaches', array['events']) $$,
  'an owner starts a launch for themselves'
);
select throws_ok(
  $$ insert into public.space_launch (owner_id) values ('00000000-0000-4000-b200-000000000001') $$,
  '23505',
  null,
  'a second active launch for the same owner is refused'
);
select throws_ok(
  $$ insert into public.space_launch (owner_id) values ('00000000-0000-4000-b200-000000000002') $$,
  '42501',
  null,
  'an owner cannot start a launch in someone else''s name'
);
select throws_ok(
  $$ insert into public.space_launch (owner_id, steps) values ('00000000-0000-4000-b200-000000000001', '[]'::jsonb) $$,
  '23514',
  null,
  'steps must be an object'
);
select is(
  (select count(*)::int from public.space_launch),
  1,
  'the owner reads only their own launch'
);
select lives_ok(
  $$ update public.space_launch
        set steps = '{"spotlight":{"state":"published"}}'::jsonb, stage = 'gather', current_step = 'space', updated_at = now()
      where id = '00000000-0000-4000-d200-000000000001' $$,
  'publishing step one moves the cursor and saves the step'
);
select throws_ok(
  $$ update public.space_launch set cancelled_at = now() where id = '00000000-0000-4000-d200-000000000001' $$,
  '23514',
  null,
  'DOUBLE CONFIRM: a launch cannot be cancelled before the cancel was requested'
);
select lives_ok(
  $$ update public.space_launch set cancel_requested_at = now() where id = '00000000-0000-4000-d200-000000000001' $$,
  'asking to cancel only records the request'
);
select is(
  (select cancelled_at is null from public.space_launch where id = '00000000-0000-4000-d200-000000000001'),
  true,
  'one call leaves the launch active'
);
select throws_ok(
  $$ update public.space_launch set cancelled_at = now(), completed_at = now() where id = '00000000-0000-4000-d200-000000000001' $$,
  '23514',
  null,
  'a launch is cancelled or completed, never both'
);

-- Sources, facts and the attestation on the owner's own launch.
select lives_ok(
  $$ insert into public.launch_sources (id, launch_id, kind, label, size_bytes, char_count)
     values ('00000000-0000-4000-d200-0000000000a1', '00000000-0000-4000-d200-000000000001', 'outline', 'Studio outline.pdf', 1200, 900) $$,
  'an owner adds a source to their launch'
);
select throws_ok(
  $$ insert into public.launch_sources (launch_id, kind, label)
     values ('00000000-0000-4000-d200-000000000001', 'carrier-pigeon', 'x') $$,
  '23514',
  null,
  'a source kind outside the list is refused'
);
select throws_ok(
  $$ insert into public.launch_sources (launch_id, kind, label)
     values ('00000000-0000-4000-d200-000000000002', 'website', 'https://example.com') $$,
  '42501',
  null,
  'an owner cannot plant a source on someone else''s launch'
);
select lives_ok(
  $$ insert into public.launch_facts (id, launch_id, source_id, slot, value, snippet, origin)
     values ('00000000-0000-4000-d200-0000000000f1', '00000000-0000-4000-d200-000000000001',
             '00000000-0000-4000-d200-0000000000a1', 'tagline', 'Slow mornings for tired people',
             'Slow mornings for tired people, every Tuesday.', 'Studio outline.pdf, page 1') $$,
  'a cited fact is accepted'
);
select throws_ok(
  $$ insert into public.launch_facts (launch_id, source_id, slot, value, snippet, origin)
     values ('00000000-0000-4000-d200-000000000001', '00000000-0000-4000-d200-0000000000a1', 'tagline', 'Made up', '', 'Studio outline.pdf') $$,
  '23514',
  null,
  'a fact with no verbatim snippet is refused'
);
select throws_ok(
  $$ insert into public.launch_facts (launch_id, source_id, slot, value, snippet)
     values ('00000000-0000-4000-d200-000000000001', '00000000-0000-4000-d200-0000000000a1', 'tagline', 'Made up', 'a snippet') $$,
  '23502',
  null,
  'a fact with no origin is refused'
);
select lives_ok(
  $$ insert into public.launch_list_attestations (launch_id, source_id, wording_version, answer)
     values ('00000000-0000-4000-d200-000000000001', '00000000-0000-4000-d200-0000000000a1', 'v1', 'confirmed') $$,
  'an owner records their consent answer before a list goes in'
);
select throws_ok(
  $$ update public.launch_list_attestations set answer = 'declined' $$,
  '42501',
  null,
  'a recorded consent answer cannot be edited'
);
select throws_ok(
  $$ select 1 from public.launch_email_log $$,
  '42501',
  null,
  'the reminder log is not readable from a signed-in session'
);

-- ── 4. THE STRANGER ──────────────────────────────────────────────────────────────────────────────

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a200-000000000002')::text, true);

select is(
  (select count(*)::int from public.space_launch where id = '00000000-0000-4000-d200-000000000001'),
  0,
  'a stranger reads no one else''s launch'
);
select is_empty(
  $$ select id from public.launch_sources $$,
  'a stranger reads no source'
);
select is_empty(
  $$ select id from public.launch_facts $$,
  'a stranger reads no fact'
);
select is_empty(
  $$ select id from public.launch_list_attestations $$,
  'a stranger reads no attestation'
);

-- ── 5. REMOVING A SOURCE REMOVES ITS FACTS ───────────────────────────────────────────────────────

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a200-000000000001')::text, true);

select lives_ok(
  $$ delete from public.launch_sources where id = '00000000-0000-4000-d200-0000000000a1' $$,
  'an owner removes a source'
);
select is(
  (select count(*)::int from public.launch_facts where source_id = '00000000-0000-4000-d200-0000000000a1'),
  0,
  'its facts went with it'
);

reset role;

-- A finished launch frees the owner's slot (checked as postgres so the cancel is a plain update).
update public.space_launch set cancelled_at = now() where id = '00000000-0000-4000-d200-000000000001';
select lives_ok(
  $$ insert into public.space_launch (owner_id) values ('00000000-0000-4000-b200-000000000001') $$,
  'once a launch is cancelled the owner can start a new one'
);

select * from finish();
rollback;
