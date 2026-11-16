-- pgTAP guard for migration 20270346076000_hunt_pass_snapshot.sql (FH-036S).
-- One session, one transaction. It proves the snapshot column exists and is NULL for an ordinary ticket,
-- that a reserved ticket can carry one snapshot object, that a value which is not a snapshot object is
-- refused, and that no browser role can write a ticket (so no browser can forge a snapshot).
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.
begin;
select plan(8);

insert into public.events (id, title, slug, scope_type, scope_id, visibility, status, starts_at, ends_at, join_mode, is_cancelled)
values
  ('00000000-0000-4000-a036-000000000001', 'FH036S pass', 'fh036s-pass', 'public',
   '00000000-0000-4000-a036-0000000000aa', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'tickets', false);
insert into public.event_ticket_types (id, event_id, name, pricing_mode, price_cents, quantity)
values ('00000000-0000-4000-a036-0000000000c1', '00000000-0000-4000-a036-000000000001', 'Pass tier', 'fixed', 4500, null);

select has_column('public', 'event_tickets', 'hunt_pass', 'the ticket has a snapshot column');
select col_type_is('public', 'event_tickets', 'hunt_pass', 'jsonb', 'the snapshot is jsonb');
select col_is_null('public', 'event_tickets', 'hunt_pass', 'the snapshot is optional');

select is(
  (public.reserve_ticket_atomic(
     '00000000-0000-4000-a036-0000000000c1', '00000000-0000-4000-a036-000000000001',
     null, 2, 9000, 450, 'usd', 'fh036s_sess_1', 'fh036s@test.local') ->> 'reserved'),
  'true', 'the ordinary reservation still reserves');
select ok(
  (select hunt_pass is null from public.event_tickets where stripe_checkout_session_id = 'fh036s_sess_1'),
  'an ordinary ticket carries no snapshot');

update public.event_tickets
   set hunt_pass = '{"v":1,"snapshot":{"bindingId":"b","bindingRevision":1,"huntId":"h","versionId":"v","sellerSpaceId":"s","benefitCodes":["tasting"]},"eventId":"e","ticketTypeId":"t","qty":2,"unitCents":4500,"totalCents":9000,"chargedCents":9000,"currency":"USD"}'::jsonb
 where stripe_checkout_session_id = 'fh036s_sess_1';
select is(
  (select hunt_pass->'snapshot'->>'bindingId' from public.event_tickets where stripe_checkout_session_id = 'fh036s_sess_1'),
  'b', 'the service role stores one snapshot on the reserved ticket');

select throws_ok(
  $$update public.event_tickets set hunt_pass = '["not","a","snapshot"]'::jsonb where stripe_checkout_session_id = 'fh036s_sess_1'$$,
  '23514', null, 'a value that is not a snapshot object is refused');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'event_tickets' and cmd in ('UPDATE', 'INSERT', 'ALL')),
  0, 'row level security gives no browser role a way to write a ticket, so none can forge a snapshot');

select * from finish();
rollback;
