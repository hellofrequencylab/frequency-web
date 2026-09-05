-- pgTAP behavioral guard for capture_guest_rsvp after 20270345000600 (scan2 L7-5).
--
-- The function is granted to `anon` and reachable over PostgREST directly, so its own guard list is
-- the whole rule for a signed-out caller. This file pins the two things that list was missing:
--
--   · a DRAFT event (status = 'draft') takes no guest seat, whatever its visibility says;
--   · a REMOVED event (removed_at set) takes no guest seat;
--   · a resubmit for an address that already holds a seat does NOT replace the stored guest_name.
--     It may still fill in a name the row never had.
--
-- Every call is made AS anon, because that is the role the defect was reachable from. The seeded
-- published event is the positive control: without it a function that refused everything would
-- pass the two refusal tests by doing nothing.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(9);

-- ── Seed: three public, future, RSVP-mode, uncancelled events that differ in exactly one column ──────
-- scope_type 'public' with a scope_id that resolves to nothing is what a standalone public event
-- looks like to sync_event_scope_arc (EXISTS-guarded, leaves the typed column null). host_id stays
-- null so the suspension trigger has no actor to check. status defaults to 'published'.
insert into public.events (id, title, slug, scope_type, scope_id, visibility, status, removed_at, starts_at, ends_at, join_mode, is_cancelled)
values
  ('00000000-0000-4000-e700-000000000001', 'L7-5 published', 'l75-published', 'public',
   '00000000-0000-4000-e700-0000000000aa', 'public', 'published', null,
   now() + interval '30 days', now() + interval '30 days 2 hours', 'rsvp', false),
  ('00000000-0000-4000-e700-000000000002', 'L7-5 draft', 'l75-draft', 'public',
   '00000000-0000-4000-e700-0000000000aa', 'public', 'draft', null,
   now() + interval '30 days', now() + interval '30 days 2 hours', 'rsvp', false),
  ('00000000-0000-4000-e700-000000000003', 'L7-5 removed', 'l75-removed', 'public',
   '00000000-0000-4000-e700-0000000000aa', 'public', 'published', now() - interval '1 day',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'rsvp', false);

-- ── 1. Positive control: the published event seats a guest, as anon ─────────────────────────────
set local role anon;

select ok(
  public.capture_guest_rsvp('00000000-0000-4000-e700-000000000001', 'guest@example.com', 'First Name') is not null,
  'CONTROL: anon gets a receipt for a well-formed address on a published event'
);
select ok(
  public.capture_guest_rsvp('00000000-0000-4000-e700-000000000002', 'guest@example.com', 'Draft Guest') is not null,
  'a draft event returns the SAME opaque receipt (no error, no null): the refusal is not an oracle'
);
select ok(
  public.capture_guest_rsvp('00000000-0000-4000-e700-000000000003', 'guest@example.com', 'Removed Guest') is not null,
  'a removed event returns the same opaque receipt too'
);

reset role;

select is(
  (select count(*)::int from public.event_rsvps
    where event_id = '00000000-0000-4000-e700-000000000001' and guest_email = 'guest@example.com'),
  1,
  'CONTROL: the published event holds the guest seat'
);

-- ── 2. The two refusals ─────────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.event_rsvps where event_id = '00000000-0000-4000-e700-000000000002'),
  0,
  'DRAFT REFUSED: a status = draft event takes no guest seat from anon, whatever its visibility'
);
select is(
  (select count(*)::int from public.event_rsvps where event_id = '00000000-0000-4000-e700-000000000003'),
  0,
  'REMOVED REFUSED: an event with removed_at set takes no guest seat from anon'
);

-- ── 3. A resubmit never renames an existing guest ───────────────────────────────────────────────
set local role anon;
select ok(
  public.capture_guest_rsvp('00000000-0000-4000-e700-000000000001', 'Guest@Example.com', 'Renamed By Stranger') is not null,
  'a second submit for the same address (different case, different name) still gets a receipt'
);
reset role;

select is(
  (select guest_name from public.event_rsvps
    where event_id = '00000000-0000-4000-e700-000000000001' and guest_email = 'guest@example.com'),
  'First Name',
  'RENAME REFUSED: the stored guest_name survives a resubmit with a different name'
);

-- The fill-in half still works: a seat taken with no name accepts one on the next submit.
set local role anon;
select public.capture_guest_rsvp('00000000-0000-4000-e700-000000000001', 'nameless@example.com', null);
select public.capture_guest_rsvp('00000000-0000-4000-e700-000000000001', 'nameless@example.com', 'Filled In');
reset role;

select is(
  (select guest_name from public.event_rsvps
    where event_id = '00000000-0000-4000-e700-000000000001' and guest_email = 'nameless@example.com'),
  'Filled In',
  'a NULL guest_name is still filled in by a later submit (the only change a resubmit may make)'
);

select * from finish();
rollback;
