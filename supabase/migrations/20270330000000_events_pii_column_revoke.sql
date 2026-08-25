-- The precise address, the host's personal contact and the private join link stop being readable
-- with the public anon key (SCAN-209).
--
-- 🔴 THE DEFECT, REPRODUCED BEFORE AND AFTER. `public.events` carries no table-wide SELECT for anon
-- or authenticated — someone was careful, and `claim_token` and `rsvp_requires_approval` are
-- correctly withheld — but COLUMN-level SELECT was granted on almost everything else, including the
-- exact set a host asks us to keep. Measured on production 2026-08-25 as `role anon`:
--
--     rows readable                       59
--     rows with hide_address = true       18   ← every one of them still returned `street`
--     rows with organizer_contact         24   ← host phone numbers and personal email addresses
--
-- `hide_address` was therefore a RENDER-LAYER control only. The page honoured it; the database did
-- not. Anyone with the publishable anon key (it ships in the browser bundle, by design) could ask
-- PostgREST directly for `street, postal_code, geog` on exactly the rows whose hosts had switched
-- the address off, plus a sub-metre `geog` point for all of them.
--
-- This is the ADR-964 shape, verbatim: a table whose ROW policy is right and whose COLUMN grants
-- were never narrowed. That ADR was written about a correctly-`public` table with an anon-readable
-- stripe_customer_id. `scripts/table-grants.txt` says so in its own header — `public` and
-- `authenticated` are DECLARATIONS the gate cannot verify, and `check:grants` cannot see column
-- grants at all. This migration is what that warning looks like when it comes true.
--
-- WHAT IS REVOKED, and why each one:
--   street, postal_code, geog, location, venue_name
--       the precise venue. ADR-186 makes the public contract CITY-LEVEL ONLY, and lib/jsonld.ts,
--       app/discover/events/_data.ts and the event page all honour it. `location` is in the list
--       because it is free text a host types, is not city-redacted, and the listing schema already
--       refuses to publish it for that reason.
--   organizer_contact, venmo_handle
--       a person's phone number, email or payment handle. Never public, on any event.
--   online_url
--       the members-only join link. 0 rows carry one today, so this closes the door before anyone
--       walks through it rather than after.
--   mux_stream_id, mux_playback_id
--       live-stream identifiers. A stream id is a credential-shaped value.
--
-- WHAT IS DELIBERATELY KEPT, because the public surface genuinely reads it. `app/discover/events/
-- _data.ts` is the ONE module that reads this table with the anon key (every other of the 245
-- `from('events')` sites goes through `createAdminClient`, which is not subject to grants), and its
-- SAFE_COLUMNS are exactly: id, slug, title, description, starts_at, ends_at, city, region, country,
-- attendance_mode, is_cancelled, category, price_cents, currency + SERIES_COLUMNS
-- (recurrence_type, recurrence_until, parent_event_id). It also FILTERS on visibility and status,
-- and a filter needs SELECT on the column just as a projection does. `lib/events/guest-seat-claim.ts`
-- reads slug/starts_at/ends_at/is_cancelled/time_zone with the caller's own session client. All of
-- those keep their grant, and the verification block at the end proves the real query still runs.
--
-- ⚠️ THIS DOES NOT FIX THE .ics FEEDS. `app/events/[slug]/event.ics`, `app/events/calendar.ics` and
-- the two scoped feeds read through `createAdminClient()`, which bypasses RLS and grants entirely,
-- and they do not consult `hide_address` — so they publish the street for a hidden-address event to
-- anyone with the URL. That is an application fix in the same change as this one, and a grant can
-- never catch it. Recorded so a future reader does not mistake this migration for the whole answer.

begin;

revoke select (
  street,
  postal_code,
  geog,
  location,
  venue_name,
  organizer_contact,
  venmo_handle,
  online_url,
  mux_stream_id,
  mux_playback_id
) on public.events from anon, authenticated;

-- Default privileges are what re-granted these in the first place (Supabase ships
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public, ADR-959), so a future column added to this table
-- arrives readable. Nothing here can prevent that; `check:grants` plus this file's list is the
-- record of which columns were judged unsafe, and a new sensitive column must be added to both.

-- PROVE IT, IN THE SAME TRANSACTION, BOTH WAYS. A revoke that silently broke the public events hub
-- would be a worse outcome than the leak, so the positive control runs first.
--
-- ⚠️ AND THE CONTROL IS CONDITIONAL ON THERE BEING ROWS TO FIND, which the first version was not —
-- it required the read to return at least one row, so it aborted on an EMPTY database and `db-tests`
-- (which replays every migration on a fresh one) went red. That is the same defect this whole file
-- is about, wearing the other hat: an assertion that cannot tell "nothing is there" from "I am not
-- allowed to look". The privilege half is exercised either way and needs no rows — if `title` or
-- `visibility` had been revoked by mistake, the SELECT below raises 42501 and takes the transaction
-- with it. Only the "and it still returns something" half needs a populated table.
do $$
declare v_total int; v_rows int;
begin
  select count(*) into v_total
    from public.events
   where visibility = 'public' and status = 'published' and is_cancelled = false;

  -- POSITIVE: the real /discover projection, AS ANON. Running at all is the privilege proof.
  set local role anon;
  select count(*) into v_rows
    from (
      select id, slug, title, description, starts_at, ends_at, city, region, country,
             attendance_mode, is_cancelled, category, price_cents, currency,
             recurrence_type, recurrence_until, parent_event_id
        from public.events
       where visibility = 'public' and status = 'published' and is_cancelled = false
    ) q;
  reset role;

  if v_total > 0 and v_rows = 0 then
    raise exception 'the public events read returned nothing after the revoke, aborting';
  end if;
end $$;

do $$
begin
  -- NEGATIVE: the leak must now be refused rather than merely empty. `has_column_privilege` is the
  -- honest check here — a SELECT that errors inside a DO block would abort the transaction, and
  -- "it threw" and "it returned no rows" are the two things this file must not confuse.
  if has_column_privilege('anon', 'public.events', 'street', 'SELECT')
     or has_column_privilege('anon', 'public.events', 'geog', 'SELECT')
     or has_column_privilege('anon', 'public.events', 'organizer_contact', 'SELECT')
     or has_column_privilege('authenticated', 'public.events', 'street', 'SELECT')
     or has_column_privilege('authenticated', 'public.events', 'organizer_contact', 'SELECT')
  then
    raise exception 'the revoke did not take, aborting';
  end if;
  -- ...and the columns the public surface needs must still be there, or the hub 500s on deploy.
  if not has_column_privilege('anon', 'public.events', 'title', 'SELECT')
     or not has_column_privilege('anon', 'public.events', 'visibility', 'SELECT')
     or not has_column_privilege('anon', 'public.events', 'starts_at', 'SELECT')
  then
    raise exception 'the revoke took too much, aborting';
  end if;
end $$;

commit;
