-- pgTAP guard for PERF-018: the faster tier read policy shows exactly what the old one did.
-- A visitor reads the tiers of a published public event and none of a draft event's, because both
-- policy forms read public.events under the caller's own RLS. Runs via `supabase test db`.

begin;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-4000-a018-000000000001', 'perf018-host@test.local');
insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b018-000000000001', '00000000-0000-4000-a018-000000000001', 'PERF018 Host', 'perf018-host');
delete from public.profiles
where auth_user_id = '00000000-0000-4000-a018-000000000001'
  and id <> '00000000-0000-4000-b018-000000000001';

insert into public.events (id, title, slug, scope_type, scope_id, visibility, status, starts_at, ends_at,
                           join_mode, is_cancelled, capacity, time_zone, host_id, price_cents)
values
  ('00000000-0000-4000-e018-000000000001', 'PERF018 live', 'perf018-live', 'public',
   '00000000-0000-4000-e018-0000000000aa', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'auto', false, null,
   'America/Los_Angeles', '00000000-0000-4000-b018-000000000001', 0),
  ('00000000-0000-4000-e018-000000000002', 'PERF018 draft', 'perf018-draft', 'public',
   '00000000-0000-4000-e018-0000000000aa', 'public', 'draft',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'auto', false, null,
   'America/Los_Angeles', '00000000-0000-4000-b018-000000000001', 0);

insert into public.event_ticket_types (event_id, name, price_cents, active)
values
  ('00000000-0000-4000-e018-000000000001', 'PERF018 GA', 2500, true),
  ('00000000-0000-4000-e018-000000000002', 'PERF018 hidden', 2500, true);

select policies_are('public', 'event_ticket_types', array['read tiers for visible events'],
  'event_ticket_types keeps one read policy and no write policy');

select ok(
  (select qual from pg_policies where tablename = 'event_ticket_types' and policyname = 'read tiers for visible events')
    ~* 'exists',
  'the read policy is the correlated EXISTS form');

set local role anon;
select is(
  (select count(*)::int from public.event_ticket_types where event_id = '00000000-0000-4000-e018-000000000001'),
  1, 'a visitor reads the tier of a published public event');
select is(
  (select count(*)::int from public.event_ticket_types where event_id = '00000000-0000-4000-e018-000000000002'),
  0, 'a visitor reads no tier of a draft event');
reset role;

select * from finish();
rollback;
