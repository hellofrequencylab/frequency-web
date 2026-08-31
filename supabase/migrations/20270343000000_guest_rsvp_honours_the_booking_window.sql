-- capture_guest_rsvp honours the host's BOOKING WINDOW (ADR-1174).
--
-- THE GAP. A host can set "RSVPs open at" / "RSVPs close at" in event settings. Those two values
-- have been written to `events.details.rsvpWindow` and printed on the event page since the control
-- shipped, and NOTHING has ever enforced them — not the member actions, not this function. A host
-- who closed RSVPs a week before the door went on collecting them, and the page went on telling
-- readers the opposite. The app half is fixed in lib/events/rsvp-window.ts; this is the other half,
-- and it is the half that counts for a signed-out guest, because this function is granted to
-- `anon` and reachable over PostgREST directly. A guard that lives only in the server action is a
-- guard a caller can decline to use.
--
-- THE SHAPE. `details.rsvpWindow` is `{"opensAt": "...", "closesAt": "..."}`, either side nullable,
-- the key itself absent on nearly every event. Absent, malformed, or unparseable = OPEN: refusing
-- an RSVP is the expensive direction, and this door fails silently by design (every rejection
-- returns the same opaque receipt), so a bad bag must not quietly stop taking guests.
--
-- TIME. Both values are stored the way `starts_at` is — the event's WALL CLOCK carried in UTC parts
-- — because they come from the same datetime-local control. So they resolve through the same
-- `at time zone 'UTC' at time zone <event zone>` pair 20270328000000 introduced. Comparing the raw
-- stored value to now() is the seven-hours-early bug that migration exists to fix; it is not
-- repeated here.
--
-- A BACKWARDS WINDOW (closes at or before it opens) is treated as NO window rather than as a door
-- nobody can walk through. A host who fat-fingers two dates should not silently lose every guest,
-- and there is no channel from inside this function to tell them.
--
-- Everything else is unchanged: the receipt shape, the anti-oracle branch set, the capacity
-- trigger, the approval routing, and the resubmit rule that refuses to move a seat.

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
  v_tz       text;
  v_starts   timestamptz;
  v_win      jsonb;
  v_opens    timestamptz;
  v_closes   timestamptz;
begin
  -- The ONLY branch that returns anything other than an opaque receipt. Same shape the app layer
  -- validates with, re-checked here because anon reaches this function directly over PostgREST.
  if v_email = '' or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return null;
  end if;

  select e.id, e.capacity, e.is_cancelled, e.starts_at, e.visibility, e.join_mode,
         e.rsvp_requires_approval, e.time_zone, e.details
    into v_event
    from public.events e
   where e.id = p_event_id;

  -- Resolve the event's wall clock to a true instant, falling back to the community zone when the
  -- stored name is not one Postgres knows (`at time zone` would otherwise raise on the anon door).
  if v_event.id is not null then
    select t.name into v_zone
      from pg_timezone_names t
     where t.name = v_event.time_zone;
    v_tz := coalesce(v_zone, 'America/Los_Angeles');
    v_starts := (v_event.starts_at at time zone 'UTC') at time zone v_tz;

    -- The booking window, read defensively: a non-object bag, a non-text side, or a value that is
    -- not a timestamp all leave the corresponding bound NULL, which means "unbounded".
    v_win := case
               when jsonb_typeof(coalesce(v_event.details, '{}'::jsonb) -> 'rsvpWindow') = 'object'
                 then v_event.details -> 'rsvpWindow'
               else '{}'::jsonb
             end;
    begin
      v_opens := case
                   when jsonb_typeof(v_win -> 'opensAt') = 'string' and (v_win ->> 'opensAt') <> ''
                     then ((v_win ->> 'opensAt')::timestamp) at time zone v_tz
                 end;
    exception when others then
      v_opens := null;
    end;
    begin
      v_closes := case
                    when jsonb_typeof(v_win -> 'closesAt') = 'string' and (v_win ->> 'closesAt') <> ''
                      then ((v_win ->> 'closesAt')::timestamp) at time zone v_tz
                  end;
    exception when others then
      v_closes := null;
    end;
    -- Backwards window = no window (see the header).
    if v_opens is not null and v_closes is not null and v_closes <= v_opens then
      v_opens := null;
      v_closes := null;
    end if;
  end if;

  -- Every rejection below returns the receipt, NOT an error and NOT null: a caller must not be able
  -- to distinguish a real open event from a cancelled one, a past one, a private one, a ticketed
  -- one, one whose booking window has not opened or has closed, or an id that was never an event.
  if v_event.id is null
     or v_event.is_cancelled
     or v_starts <= now()
     or v_event.visibility not in ('public', 'unlisted')
     or v_event.join_mode = 'tickets'
     or (v_opens is not null and now() < v_opens)
     or (v_closes is not null and now() >= v_closes)
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
