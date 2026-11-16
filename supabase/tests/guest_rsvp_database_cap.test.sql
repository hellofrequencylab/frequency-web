-- pgTAP behavioral guard for the rate cap inside capture_guest_rsvp (migration 20270346063000, SCAN-1245).
--
-- The function is granted to `anon` and reachable over PostgREST directly, so the app's per-IP limit is not on
-- the path of a caller who skips the app. This file pins the cap the function carries itself:
--
--   · the 61st NEW guest seat on one event inside a rolling hour is not written, and the caller still gets a
--     receipt (the refusal is not an oracle);
--   · an address that already holds a seat resubmits straight through the cap, and still cannot rename itself;
--   · another event is unaffected (the cap is per event);
--   · seats older than an hour stop counting against the hourly cap;
--   · the 301st new guest seat inside a rolling 24 hours is not written either.
--
-- Every seat is written through the door itself, as anon for the assertions, so nothing here assumes a column
-- the door does not set. The fills are aged with a direct update as the test's own role.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(11);

-- Three public, future, RSVP-mode, uncancelled events (same shape guest_rsvp_refuses_draft_removed_and_rename uses).
insert into public.events (id, title, slug, scope_type, scope_id, visibility, status, removed_at, starts_at, ends_at, join_mode, is_cancelled)
values
  ('00000000-0000-4000-e745-000000000001', 'S1245 hourly', 's1245-hourly', 'public',
   '00000000-0000-4000-e745-0000000000aa', 'public', 'published', null,
   now() + interval '30 days', now() + interval '30 days 2 hours', 'rsvp', false),
  ('00000000-0000-4000-e745-000000000002', 'S1245 other', 's1245-other', 'public',
   '00000000-0000-4000-e745-0000000000aa', 'public', 'published', null,
   now() + interval '30 days', now() + interval '30 days 2 hours', 'rsvp', false),
  ('00000000-0000-4000-e745-000000000003', 'S1245 daily', 's1245-daily', 'public',
   '00000000-0000-4000-e745-0000000000aa', 'public', 'published', null,
   now() + interval '30 days', now() + interval '30 days 2 hours', 'rsvp', false);

-- ── 1. The hourly cap ───────────────────────────────────────────────────────────────────────────
set local role anon;

select ok(
  public.capture_guest_rsvp('00000000-0000-4000-e745-000000000001', 'first@s1245.test', 'First Name') is not null,
  'CONTROL: anon gets a receipt for the first guest'
);
-- 59 more through the same door: the event now holds exactly 60 guest seats written this hour.
select is(
  (select count(public.capture_guest_rsvp('00000000-0000-4000-e745-000000000001', 'fill' || g || '@s1245.test', null))::int
     from generate_series(1, 59) g),
  59,
  'CONTROL: 59 further guests each get a receipt'
);
select ok(
  public.capture_guest_rsvp('00000000-0000-4000-e745-000000000001', 'over@s1245.test', 'Over') is not null,
  'AT THE CAP the reply is still an opaque receipt (no error, no null)'
);
select ok(
  public.capture_guest_rsvp('00000000-0000-4000-e745-000000000001', 'FIRST@s1245.test', 'Renamed') is not null,
  'an address that already holds a seat resubmits through the cap'
);
select ok(
  public.capture_guest_rsvp('00000000-0000-4000-e745-000000000002', 'other@s1245.test', null) is not null,
  'another event still answers'
);

reset role;

select is(
  (select count(*)::int from public.event_rsvps where event_id = '00000000-0000-4000-e745-000000000001'),
  60,
  'HOURLY CAP: the 61st new guest seat in one hour was not written'
);
select is(
  (select guest_name from public.event_rsvps
    where event_id = '00000000-0000-4000-e745-000000000001' and guest_email = 'first@s1245.test'),
  'First Name',
  'the resubmit through the cap did not rename the guest'
);
select is(
  (select count(*)::int from public.event_rsvps where event_id = '00000000-0000-4000-e745-000000000002'),
  1,
  'PER EVENT: the other event took its guest while the first was capped'
);

-- ── 2. The window is rolling: seats older than an hour stop counting ────────────────────────────
update public.event_rsvps set created_at = now() - interval '2 hours'
 where event_id = '00000000-0000-4000-e745-000000000001';

set local role anon;
select ok(
  public.capture_guest_rsvp('00000000-0000-4000-e745-000000000001', 'later@s1245.test', null) is not null,
  'a guest an hour later gets a receipt'
);
reset role;

select is(
  (select count(*)::int from public.event_rsvps where event_id = '00000000-0000-4000-e745-000000000001'),
  61,
  'ROLLING HOUR: seats older than an hour do not count, so the later guest was seated'
);

-- ── 3. The daily cap ────────────────────────────────────────────────────────────────────────────
-- 300 seats inside 24 hours and none inside the last hour: five rounds of 60 through the door, each aged two hours.
do $$
begin
  for i in 1..5 loop
    perform public.capture_guest_rsvp('00000000-0000-4000-e745-000000000003', 'day' || i || '-' || g || '@s1245.test', null)
       from generate_series(1, 60) g;
    update public.event_rsvps set created_at = now() - interval '2 hours'
     where event_id = '00000000-0000-4000-e745-000000000003';
  end loop;
end $$;

set local role anon;
select public.capture_guest_rsvp('00000000-0000-4000-e745-000000000003', 'dayover@s1245.test', null);
reset role;

select is(
  (select count(*)::int from public.event_rsvps where event_id = '00000000-0000-4000-e745-000000000003'),
  300,
  'DAILY CAP: the 301st new guest seat in 24 hours was not written'
);

select * from finish();
rollback;
