-- capture_guest_rsvp refuses a DRAFT or REMOVED event, and never renames an existing guest (scan2 L7-5).
--
-- THE DEFECT. This function is granted to `anon` and reachable over PostgREST directly, so its own
-- guard list is the whole rule for a signed-out caller. That list checked is_cancelled, the start
-- time, visibility, join_mode and the booking window (20270343000000) and omitted TWO columns the
-- read policy on `events` treats as decisive:
--
--   status      20260613130000 makes a status = 'draft' event readable only by its poster, its host
--               and guide+, whatever its visibility says. A draft is a private work in progress.
--   removed_at  the same migration's operator removal. Every lister in lib/events/store.ts filters
--               `removed_at is null`; a removed event is gone from every page.
--
-- So a caller holding the uuid of a public draft, or of a removed event, could seat a guest on it.
-- The seat consumed capacity on an event nobody else could see, and the receipt email went out for
-- an event that was not published.
--
-- THE SECOND DEFECT, in the same function. The resubmit branch read
--     set guest_name = coalesce(excluded.guest_name, r.guest_name)
-- which lets a resubmit REPLACE the stored name, not only fill in a missing one. An anonymous
-- caller who knows an attendee's address could rename them on the host's roster. The comment above
-- that line said "a resubmit may fill in a name it did not have", and the code did more than the
-- comment said.
--
-- THE FIX.
--   1. The guard list now also refuses `status is distinct from 'published'` and
--      `removed_at is not null`. Same shape as every other rejection: the opaque receipt, not an
--      error and not null, so a caller still cannot tell a draft from a cancelled event from an id
--      that was never an event.
--   2. The resubmit branch becomes `coalesce(r.guest_name, excluded.guest_name)`: the stored name
--      wins, a NULL is filled in, nothing else moves. The guest row carries no per-row token (its
--      columns are guest_email, guest_name, guest_claimed_by, guest_claimed_at), so there is no
--      proof of ownership an anonymous caller could present, and the row is therefore returned
--      unchanged. This is NOT reported in the return shape on purpose: the header of 20270303000100
--      names exactly the oracle a distinguishable return would reopen ("is THIS PERSON going to THIS
--      EVENT"). A guest who wants a different name on the roster signs in with that address, and
--      claim_guest_rsvps hands them the seat.
--
-- Everything else is unchanged from 20270343000000: the receipt shape, the anti-oracle branch set,
-- the zone-aware start time, the booking window, the capacity trigger and the approval routing.
--
-- ACL. `create or replace` preserves the existing ACL, so the grants are already right after the
-- replace. They are restated below, role-explicit, so this file carries its own verdict
-- (scripts/function-grants.txt: `public`, the anon front door for a signed-out guest).
--
-- House style: additive + idempotent (create or replace); SECURITY DEFINER with a pinned
-- search_path. No em or en dashes. pgTAP: supabase/tests/guest_rsvp_refuses_draft_removed_and_rename.test.sql.

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
         e.rsvp_requires_approval, e.time_zone, e.details, e.status, e.removed_at
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
    -- Backwards window = no window (see 20270343000000).
    if v_opens is not null and v_closes is not null and v_closes <= v_opens then
      v_opens := null;
      v_closes := null;
    end if;
  end if;

  -- Every rejection below returns the receipt, NOT an error and NOT null: a caller must not be able
  -- to distinguish a real open event from a cancelled one, a past one, a private one, a ticketed
  -- one, a draft, a removed one, one whose booking window has not opened or has closed, or an id
  -- that was never an event.
  --
  -- 2026-09-05 (scan2 L7-5): `status` and `removed_at` join the list. A draft is readable only by
  -- its poster, host and guide+ (20260613130000), and a removed event is on no page at all; neither
  -- may take a seat from a signed-out caller who happens to hold its uuid.
  if v_event.id is null
     or v_event.is_cancelled
     or v_event.status is distinct from 'published'
     or v_event.removed_at is not null
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
    --
    -- 2026-09-05 (scan2 L7-5): the stored name WINS. The previous order, coalesce(excluded, r),
    -- let anyone who knew an attendee's address rename them on the roster. A NULL is still filled
    -- in; a name that is already there is kept, and the row is otherwise returned unchanged.
    set guest_name = coalesce(r.guest_name, excluded.guest_name);

  return v_receipt;
end;
$$;

comment on function public.capture_guest_rsvp(uuid, text, text) is
  'Anon door for a signed-out guest RSVP. Returns an opaque random uuid on every path except a malformed address (null), so it cannot answer "is this person going to this event". Refuses a draft, removed, cancelled, past, non-public, ticketed or window-closed event with the same receipt. A resubmit fills in a missing guest_name and never replaces one. Writes into event_rsvps so the capacity trigger and the host approval setting apply unchanged.';

-- The anon front door: revoked by name (a `from public` alone leaves Supabase's per-role default
-- grants standing, ADR-959), then handed back to exactly the two browser roles the form runs as.
revoke execute on function public.capture_guest_rsvp(uuid, text, text) from public, anon, authenticated;
grant execute on function public.capture_guest_rsvp(uuid, text, text) to anon, authenticated;

commit;

-- Rollback: re-run the `create or replace function public.capture_guest_rsvp(...)` block of
-- 20270343000000_guest_rsvp_honours_the_booking_window.sql (the draft and removed checks go away
-- and a resubmit can rename a guest again; there is no reason to want that). The function is never
-- dropped here and the ACL is unchanged either way.
