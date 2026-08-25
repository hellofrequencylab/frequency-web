-- capture_guest_rsvp's "event already started" gate resolves the event's own zone (SCAN-101).
--
-- THE BUG. `events.starts_at` stores the event's WALL CLOCK as UTC parts — the convention
-- lib/time/zone.ts is built around, where a 7pm Pacific event is stored `T19:00:00Z`. The gate
-- compared that value directly to `now()`, which is a true instant. So the stored value passes
-- `now()` at 7pm UTC — noon Pacific — and from that moment every guest submission for tonight's
-- event was rejected, roughly seven to eight hours before the doors actually open (eight in PDT,
-- seven in PST).
--
-- It failed SILENTLY, which is what made it worth finding. This function is deliberately an
-- anti-oracle: every rejection returns the same opaque receipt so a caller cannot probe whether an
-- event is real, cancelled, private or past. The guest therefore saw the ordinary "you're in"
-- receipt and simply never got the confirmation email. Members were never affected — their path
-- (`eventOpenForRsvp`) has no time gate at all — so the whole cost fell on signed-out guests, the
-- people least able to notice or report it.
--
-- THE FIX is the SQL twin of `eventInstant` (lib/time/zone.ts:89): read the stored UTC parts as a
-- naive wall clock, then interpret that wall clock in the event's own zone to get the true instant.
--   `starts_at at time zone 'UTC'`  -> timestamp (the wall-clock parts, tz stripped)
--   `... at time zone <event zone>` -> timestamptz (the instant that wall clock names in that zone)
-- Comparing THAT to `now()` is comparing two instants, which is the comparison the gate meant.
--
-- ZONE SAFETY. `at time zone <text>` RAISES on an unrecognised zone name, and this function is
-- reachable by anon, so a bad row would turn a silent early close into a hard error on the door.
-- `events.time_zone` is `not null default 'America/Los_Angeles'` (20260924000000), but the column
-- is free text, so the zone is validated against `pg_timezone_names` and falls back to the
-- community zone — the same direction `resolveZone` fails in.
--
-- Everything else about the function is unchanged: the receipt shape, the anti-oracle branch set,
-- the capacity trigger, the approval routing, and the resubmit rule that refuses to move a seat.

begin;

create or replace function public.capture_guest_rsvp(
  p_event_id uuid,
  p_email    text,
  p_name     text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_name     text := left(nullif(btrim(coalesce(p_name, '')), ''), 120);
  v_receipt  uuid := gen_random_uuid();
  v_event    record;
  v_zone     text;
  v_starts   timestamptz;
begin
  -- The ONLY branch that returns anything other than an opaque receipt. Same shape the app layer
  -- validates with, re-checked here because anon reaches this function directly over PostgREST.
  if v_email = '' or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return null;
  end if;

  select e.id, e.capacity, e.is_cancelled, e.starts_at, e.visibility, e.join_mode,
         e.rsvp_requires_approval, e.time_zone
    into v_event
    from public.events e
   where e.id = p_event_id;

  -- Resolve the event's wall clock to a true instant, falling back to the community zone when the
  -- stored name is not one Postgres knows (`at time zone` would otherwise raise on the anon door).
  if v_event.id is not null then
    select t.name into v_zone
      from pg_timezone_names t
     where t.name = v_event.time_zone;
    v_starts := (v_event.starts_at at time zone 'UTC')
                  at time zone coalesce(v_zone, 'America/Los_Angeles');
  end if;

  -- Every rejection below returns the receipt, NOT an error and NOT null: a caller must not be able
  -- to distinguish a real open event from a cancelled one, a past one, a private one, a ticketed one
  -- or an id that was never an event.
  if v_event.id is null
     or v_event.is_cancelled
     or v_starts <= now()
     or v_event.visibility not in ('public', 'unlisted')
     or v_event.join_mode = 'tickets'
  then
    return v_receipt;
  end if;

  -- status starts at 'going' and enforce_event_rsvp_capacity() (20260610030000) demotes it to
  -- 'waitlist' when the room is full. That trigger reads only NEW.event_id and NEW.status, so the
  -- guest obeys the member rule because it is the SAME rule, not a copy of it.
  --
  -- approval_status keys on the host's setting, so a guest waits exactly as long as a member does.
  insert into public.event_rsvps as r (event_id, guest_email, guest_name, status, approval_status)
  values (
    p_event_id,
    v_email,
    v_name,
    'going',
    case when v_event.rsvp_requires_approval then 'pending' else 'none' end
  )
  on conflict (event_id, lower(guest_email)) where guest_email is not null do update
    -- A resubmit may fill in a name it did not have. It may NOT move the seat: re-submitting must
    -- never promote off the waitlist, never clear a pending approval, and never resurrect a seat the
    -- host removed. Anything that changed the row here would make the endpoint a lever, not a form.
    set guest_name = coalesce(excluded.guest_name, r.guest_name);

  return v_receipt;
end;
$$;

commit;
