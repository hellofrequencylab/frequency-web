-- circle_channels inherits the Circle's visibility
-- (20270345012000_circle_channels_inherit_circle_visibility.sql · SCAN-651 · ADR-1015).
--
-- The join carried `using (true)`, so anon could list every hidden Circle's uuid and Channels.
-- The policy now defers to the caller's view of public.circles. This file proves both halves:
--   STILL WORKING: anon reads a LISTED Circle's rows (the signed-out Circles index embeds them);
--   DENIED NOW:    anon gets no row for an UNLISTED, closed Circle, and neither does a signed-in
--                  stranger; the Circle's own member still reads them.
--
-- One transaction, rolled back: nothing persists. Fixture style follows circle_privacy.test.sql.

begin;
select plan(5);

-- ── Fixture (seeded as postgres, which RLS does not bind) ────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a651-000000000001', 'cc-host@test.local'),
  ('00000000-0000-4000-a651-000000000002', 'cc-member@test.local'),
  ('00000000-0000-4000-a651-000000000003', 'cc-stranger@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b651-000000000001', '00000000-0000-4000-a651-000000000001', 'CC Host', 'cc-host'),
  ('00000000-0000-4000-b651-000000000002', '00000000-0000-4000-a651-000000000002', 'CC Member', 'cc-member'),
  ('00000000-0000-4000-b651-000000000003', '00000000-0000-4000-a651-000000000003', 'CC Stranger', 'cc-stranger');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row; keep only the fixed ids.
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a651-000000000001',
    '00000000-0000-4000-a651-000000000002',
    '00000000-0000-4000-a651-000000000003')
  and id not in (
    '00000000-0000-4000-b651-000000000001',
    '00000000-0000-4000-b651-000000000002',
    '00000000-0000-4000-b651-000000000003');

insert into public.topical_channels (id, name, slug, category) values
  ('00000000-0000-4000-d651-000000000001', 'CC Channel', 'cc-channel', 'test');

-- A listed open Circle: the funnel every visitor may see.
insert into public.circles (id, name, slug, type, status, host_id, unlisted, access, topical_channel_id) values
  ('00000000-0000-4000-e651-000000000001', 'CC Listed', 'cc-listed', 'online', 'active',
   '00000000-0000-4000-b651-000000000001', false, 'open', '00000000-0000-4000-d651-000000000001');
-- An unlisted, closed Circle: invisible to anyone who cannot enter it (ADR-1015).
insert into public.circles (id, name, slug, type, status, host_id, unlisted, access, topical_channel_id) values
  ('00000000-0000-4000-e651-000000000002', 'CC Hidden', 'cc-hidden', 'online', 'active',
   '00000000-0000-4000-b651-000000000001', true, 'circle_members', '00000000-0000-4000-d651-000000000001');

insert into public.memberships (profile_id, circle_id, status) values
  ('00000000-0000-4000-b651-000000000002', '00000000-0000-4000-e651-000000000002', 'active');

insert into public.circle_channels (circle_id, topical_channel_id, position) values
  ('00000000-0000-4000-e651-000000000001', '00000000-0000-4000-d651-000000000001', 1),
  ('00000000-0000-4000-e651-000000000002', '00000000-0000-4000-d651-000000000001', 1)
on conflict do nothing;

-- ── 1. Anon: the listed Circle's Channel reads, the hidden Circle leaves no trace ────────────────

set local role anon;

select isnt_empty(
  $$ select circle_id from public.circle_channels where circle_id = '00000000-0000-4000-e651-000000000001' $$,
  'STILL WORKING: anon reads a listed Circle''s Channel rows (the signed-out index embed)'
);
select is_empty(
  $$ select circle_id from public.circle_channels where circle_id = '00000000-0000-4000-e651-000000000002' $$,
  'DENIED NOW: anon gets no row for an unlisted, closed Circle'
);
select is_empty(
  $$ select circle_id from public.circle_channels
     where topical_channel_id = '00000000-0000-4000-d651-000000000001'
       and circle_id = '00000000-0000-4000-e651-000000000002' $$,
  'and the Channel side of the join does not list the hidden Circle either'
);

-- ── 2. Signed in: a stranger is still shut out, a member of the hidden Circle reads it ──────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a651-000000000003')::text, true);

select is_empty(
  $$ select circle_id from public.circle_channels where circle_id = '00000000-0000-4000-e651-000000000002' $$,
  'a signed-in stranger gets no row for the hidden Circle'
);

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a651-000000000002')::text, true);

select isnt_empty(
  $$ select circle_id from public.circle_channels where circle_id = '00000000-0000-4000-e651-000000000002' $$,
  'its member reads the hidden Circle''s Channel rows, as they see the Circle'
);

select * from finish();
rollback;
