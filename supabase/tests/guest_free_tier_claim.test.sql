-- pgTAP behavioral guard for capture_guest_rsvp after 20270345004000 (LIVE-318).
--
-- A tickets-mode event now takes a guest seat when the caller names one of its FREE tiers, and
-- refuses it otherwise. The function is granted to `anon` and reachable over PostgREST directly, so
-- every call below is made AS anon, and the refusals are checked by COUNTING ROWS rather than by
-- reading the return value: every path hands back the same opaque receipt on purpose.
--
-- What this pins, and why each line is its own way for the door to open too wide or close again:
--   · CONTROL: a free, active, ungated tier of a published tickets-mode event seats a guest as a
--     'going' RSVP row (the member free path's twin), and writes NO event_tickets row and bumps NO
--     `sold`;
--   · a tickets-mode event with no tier named is still refused (the pre-LIVE-318 rule survives);
--   · a FIXED tier is refused (money is the guest ticket checkout's job, not this function's);
--   · a member_only, a space_members_only, an inactive and a sold-out free tier are each refused;
--   · a free tier that belongs to ANOTHER event is refused against this one;
--   · an RSVP-mode event ignores the tier argument and seats the guest as before.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(14);

-- ── Seed ────────────────────────────────────────────────────────────────────────────────────────
-- Two published, public, future, uncancelled TICKETS-mode events and one RSVP-mode control.
-- scope_type 'public' with a scope_id that resolves to nothing is what a standalone public event
-- looks like to sync_event_scope_arc; host_id stays null so the suspension trigger has no actor.
insert into public.events (id, title, slug, scope_type, scope_id, visibility, status, starts_at, ends_at, join_mode, is_cancelled)
values
  ('00000000-0000-4000-e900-000000000001', 'L318 ticketed', 'l318-ticketed', 'public',
   '00000000-0000-4000-e900-0000000000aa', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'tickets', false),
  ('00000000-0000-4000-e900-000000000002', 'L318 other ticketed', 'l318-other', 'public',
   '00000000-0000-4000-e900-0000000000aa', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'tickets', false),
  ('00000000-0000-4000-e900-000000000003', 'L318 rsvp', 'l318-rsvp', 'public',
   '00000000-0000-4000-e900-0000000000aa', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'rsvp', false);

-- Event 1 carries every tier shape the gate must tell apart. Event 2 carries a free tier that is
-- offerable on ITS event and must not be offerable on event 1.
insert into public.event_ticket_types
  (id, event_id, name, pricing_mode, price_cents, quantity, sold, member_only, space_members_only, active)
values
  ('00000000-0000-4000-e900-0000000000c1', '00000000-0000-4000-e900-000000000001', 'Community ticket', 'free',  0,    null, 0, false, false, true),
  ('00000000-0000-4000-e900-0000000000c2', '00000000-0000-4000-e900-000000000001', 'Day pass',         'fixed', 2500, null, 0, false, false, true),
  ('00000000-0000-4000-e900-0000000000c3', '00000000-0000-4000-e900-000000000001', 'Member free',      'free',  0,    null, 0, true,  false, true),
  ('00000000-0000-4000-e900-0000000000c4', '00000000-0000-4000-e900-000000000001', 'Retired free',     'free',  0,    null, 0, false, false, false),
  ('00000000-0000-4000-e900-0000000000c5', '00000000-0000-4000-e900-000000000001', 'Sold-out free',    'free',  0,    1,    1, false, false, true),
  ('00000000-0000-4000-e900-0000000000c6', '00000000-0000-4000-e900-000000000001', 'Space free',       'free',  0,    null, 0, false, true,  true),
  ('00000000-0000-4000-e900-0000000000d1', '00000000-0000-4000-e900-000000000002', 'Other free',       'free',  0,    null, 0, false, false, true);

-- ── 1. CONTROL: the free tier seats a guest, as anon ────────────────────────────────────────────
set local role anon;
select ok(
  public.capture_guest_rsvp('00000000-0000-4000-e900-000000000001', 'free@example.com', 'Free Guest',
                            '00000000-0000-4000-e900-0000000000c1') is not null,
  'CONTROL: anon gets a receipt naming the free tier of a published tickets-mode event'
);
reset role;

select is(
  (select count(*)::int from public.event_rsvps
    where event_id = '00000000-0000-4000-e900-000000000001' and guest_email = 'free@example.com'),
  1,
  'CONTROL: the tickets-mode event holds the guest seat'
);
select is(
  (select status || '/' || approval_status from public.event_rsvps
    where event_id = '00000000-0000-4000-e900-000000000001' and guest_email = 'free@example.com'),
  'going/none',
  'the seat is an ordinary going RSVP row, exactly what a free RSVP writes'
);
select is(
  (select count(*)::int from public.event_tickets
    where event_id = '00000000-0000-4000-e900-000000000001'),
  0,
  'NO ticket row is minted for a free claim (amount_cents carries CHECK > 0; the member path mints none either)'
);
select is(
  (select sold from public.event_ticket_types where id = '00000000-0000-4000-e900-0000000000c1'),
  0,
  'the free tier''s sold figure is untouched: sold counts succeeded purchases, never free claims'
);

-- ── 2. The refusals: every one returns a receipt and writes nothing ─────────────────────────────
set local role anon;
select ok(
  public.capture_guest_rsvp('00000000-0000-4000-e900-000000000001', 'notier@example.com', 'No Tier') is not null
  and public.capture_guest_rsvp('00000000-0000-4000-e900-000000000001', 'fixed@example.com', 'Fixed',
                                '00000000-0000-4000-e900-0000000000c2') is not null
  and public.capture_guest_rsvp('00000000-0000-4000-e900-000000000001', 'member@example.com', 'Member Only',
                                '00000000-0000-4000-e900-0000000000c3') is not null
  and public.capture_guest_rsvp('00000000-0000-4000-e900-000000000001', 'retired@example.com', 'Retired',
                                '00000000-0000-4000-e900-0000000000c4') is not null
  and public.capture_guest_rsvp('00000000-0000-4000-e900-000000000001', 'soldout@example.com', 'Sold Out',
                                '00000000-0000-4000-e900-0000000000c5') is not null
  and public.capture_guest_rsvp('00000000-0000-4000-e900-000000000001', 'space@example.com', 'Space Only',
                                '00000000-0000-4000-e900-0000000000c6') is not null
  and public.capture_guest_rsvp('00000000-0000-4000-e900-000000000001', 'foreign@example.com', 'Foreign Tier',
                                '00000000-0000-4000-e900-0000000000d1') is not null,
  'every refusal returns the SAME opaque receipt (no error, no null): the tier list is not an oracle'
);
reset role;

select is(
  (select count(*)::int from public.event_rsvps
    where event_id = '00000000-0000-4000-e900-000000000001' and guest_email = 'notier@example.com'),
  0, 'NO TIER NAMED: a tickets-mode event still refuses a bare guest RSVP'
);
select is(
  (select count(*)::int from public.event_rsvps
    where event_id = '00000000-0000-4000-e900-000000000001' and guest_email = 'fixed@example.com'),
  0, 'FIXED TIER REFUSED: a priced tier is the guest ticket checkout''s job, not a free seat'
);
select is(
  (select count(*)::int from public.event_rsvps
    where event_id = '00000000-0000-4000-e900-000000000001' and guest_email = 'member@example.com'),
  0, 'MEMBER-ONLY FREE TIER REFUSED: a guest is not a member, by definition'
);
select is(
  (select count(*)::int from public.event_rsvps
    where event_id = '00000000-0000-4000-e900-000000000001' and guest_email = 'retired@example.com'),
  0, 'INACTIVE FREE TIER REFUSED: a retired tier is not on sale'
);
select is(
  (select count(*)::int from public.event_rsvps
    where event_id = '00000000-0000-4000-e900-000000000001' and guest_email = 'soldout@example.com'),
  0, 'SOLD-OUT FREE TIER REFUSED: quantity 1, sold 1'
);
select is(
  (select count(*)::int from public.event_rsvps
    where event_id = '00000000-0000-4000-e900-000000000001' and guest_email = 'space@example.com'),
  0, 'SPACE-MEMBERS-ONLY FREE TIER REFUSED: a guest holds no Space membership'
);
select is(
  (select count(*)::int from public.event_rsvps
    where event_id = '00000000-0000-4000-e900-000000000001' and guest_email = 'foreign@example.com'),
  0, 'FOREIGN TIER REFUSED: a free tier of another event is not an offer on this one'
);

-- ── 3. An RSVP-mode event ignores the tier argument, as setRsvpStatus (the member twin) does ─────
set local role anon;
select public.capture_guest_rsvp('00000000-0000-4000-e900-000000000003', 'rsvp@example.com', 'Rsvp Guest',
                                 '00000000-0000-4000-e900-0000000000c1');
reset role;
select is(
  (select count(*)::int from public.event_rsvps
    where event_id = '00000000-0000-4000-e900-000000000003' and guest_email = 'rsvp@example.com'),
  1, 'RSVP-MODE UNCHANGED: a tier id is ignored and the guest is seated as before'
);

select * from finish();
rollback;
