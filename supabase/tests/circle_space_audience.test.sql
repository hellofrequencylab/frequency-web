-- ADR-1021 — the `space_members` Circle mode admits the Space AUDIENCE, and the CRM predicate
-- does NOT move.
--
-- The second half is the one that matters. `private.is_space_member` is used by SIXTEEN RLS
-- policies to gate the CRM, client notes, orders and disputes, so the tempting one-line fix for
-- this bug (teach it about paid memberships) would have handed every paying member of a Space
-- read access to all of it. These assertions fail if anybody ever tries that again.

begin;
select plan(8);

-- ── Fixture ──────────────────────────────────────────────────────────────────────────────────
insert into public.entities (id, key, name) values
  ('00000000-0000-4000-d200-000000000001', 'aud-labs', 'Aud Labs')
on conflict do nothing;

insert into public.profiles (id, display_name, handle, is_active) values
  ('00000000-0000-4000-b200-000000000001', 'Aud Owner',  'aud-owner',  true),
  ('00000000-0000-4000-b200-000000000002', 'Aud Staff',  'aud-staff',  true),
  ('00000000-0000-4000-b200-000000000003', 'Aud Payer',  'aud-payer',  true),
  ('00000000-0000-4000-b200-000000000004', 'Aud Nobody', 'aud-nobody', true);

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan) values
  ('00000000-0000-4000-c200-000000000001', 'aud-space', 'Aud Space', 'business',
   '00000000-0000-4000-d200-000000000001', '00000000-0000-4000-b200-000000000001',
   'active', 'network', 'business');

-- The STAFF ladder: what the mode used to admit, and must still admit.
insert into public.space_members (space_id, profile_id, role, status) values
  ('00000000-0000-4000-c200-000000000001', '00000000-0000-4000-b200-000000000002', 'viewer', 'active');

-- The PAYING member: what the label always promised and the mode never delivered.
insert into public.space_memberships (space_id, member_profile_id, status) values
  ('00000000-0000-4000-c200-000000000001', '00000000-0000-4000-b200-000000000003', 'active');

insert into public.circles (id, name, slug, type, status, space_id, unlisted, access) values
  ('00000000-0000-4000-e200-000000000001', 'Aud Circle', 'aud-circle', 'online', 'active',
   '00000000-0000-4000-c200-000000000001', false, 'space_members');

-- ── 1. The audience predicate ────────────────────────────────────────────────────────────────
set local role authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-b200-000000000003')::text, true);
select ok(private.is_space_audience('00000000-0000-4000-c200-000000000001'),
  'A PAYING member is part of the Space audience -- the bug this migration exists to fix');
select ok(private.can_enter_circle('00000000-0000-4000-e200-000000000001', 'space_members',
       '00000000-0000-4000-c200-000000000001', null),
  'and so may ENTER a space_members Circle, which is what the label has always promised');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-b200-000000000002')::text, true);
select ok(private.is_space_audience('00000000-0000-4000-c200-000000000001'),
  'STAFF still count -- the change is purely additive and shuts nobody out');
select ok(private.can_enter_circle('00000000-0000-4000-e200-000000000001', 'space_members',
       '00000000-0000-4000-c200-000000000001', null),
  'and a staff seat still opens the Circle exactly as before');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-b200-000000000004')::text, true);
select ok(not private.is_space_audience('00000000-0000-4000-c200-000000000001'),
  'someone with neither a seat nor a membership is NOT the audience');
select ok(not private.can_enter_circle('00000000-0000-4000-e200-000000000001', 'space_members',
       '00000000-0000-4000-c200-000000000001', null),
  'and cannot enter -- the default is still deny');

-- ── 2. 🔴 THE CRM WALL. The whole reason this is a second predicate. ─────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-b200-000000000003')::text, true);
select ok(not private.is_space_member('00000000-0000-4000-c200-000000000001'),
  'a PAYING member is NOT a space_member -- the predicate 16 CRM/orders/notes policies key on');

select is_empty(
  $$ select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'is_space_member'
       and p.prosrc ilike '%space_memberships%' $$,
  'is_space_member NEVER learns about paid memberships: doing so would expose the CRM pipeline, '
  'client notes, order history and disputes to every paying member of every Space');

select * from finish();
rollback;
