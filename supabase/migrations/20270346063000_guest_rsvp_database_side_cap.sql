-- SCAN-1245: capture_guest_rsvp gets a rate cap that lives in the database.
--
-- The function is SECURITY DEFINER and granted to anon, so it is reachable straight over PostgREST with the public
-- anon key. The only throttle was rateLimitOk in app/(main)/events/guest-rsvp-actions.ts (five per IP per ten
-- minutes), which a direct caller never passes through. A script could therefore write made-up guest addresses into
-- a public event as fast as it could post: every seat of a free event taken, the host's roster filled with junk.
--
-- WHAT THIS ADDS. Before a NEW guest seat is written, the function counts the guest seats this door has already
-- written for the event (guest_email set, not minted by a paid ticket) and refuses past either ceiling:
--
--     60 new guest seats per event in any rolling hour
--    300 new guest seats per event in any rolling 24 hours
--
-- Production on 2026-11-16 held four guest seats in total and never more than one per event per hour, and the
-- largest event capacity was 22, so both numbers sit far above real traffic. They are literals in the body on
-- purpose: changing one is a reviewed migration.
--
-- WHAT IT KEEPS.
--   * The signature, return type, owner, search_path and grants are unchanged (create or replace). Every caller
--     (guest-rsvp-actions.ts, ticket-actions.ts startGuestTicket through it, the pgTAP suite as anon) calls it as before.
--   * The refusal is the SAME opaque receipt every other refusal returns, so the cap is not an oracle.
--   * A resubmit for an address that already holds a seat on the event is never counted and never refused: it
--     writes no new row (it may only fill in a missing name), so it cannot be used to fill a room.
--   * Capacity, waitlist and host approval are still the trigger's and the host setting's, untouched.
--   * Everything above the cap block is the 20270345004300 body, restated verbatim.
--
-- WHAT IT DOES NOT DO. This bounds how fast a stranger can pollute one event; it does not stop a small room being
-- filled inside the first sixty calls. Closing that needs the grant moved off anon and the server action calling
-- with the service role behind its per-IP limit (docs/security/definer-rpc-review.md), which is a separate change
-- because the pgTAP suite and the action's own header pin the anon door today.
--
-- THE CAP IS LOUD. A refusal writes one LOG line to the Postgres log naming the event and both counts
-- ("capture_guest_rsvp: guest cap reached"). A cap nobody can see fire is an invisible regression.
--
-- CONCURRENCY. The count and the insert are serialised per event with a transaction-scoped advisory lock, so a
-- burst of parallel calls cannot all read the same low count. The lock is taken only on the path that would write
-- a new guest seat and is released when the call's transaction ends.
--
-- Additive and idempotent. ROLLBACK: re-run the `create or replace function public.capture_guest_rsvp(...)` block
-- from 20270345004300_host_attested_attendance.sql.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function public.capture_guest_rsvp(
  p_event_id       uuid,
  p_email          text,
  p_name           text default null,
  p_ticket_type_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email     text := lower(btrim(coalesce(p_email, '')));
  v_name      text := left(nullif(btrim(coalesce(p_name, '')), ''), 120);
  v_receipt   uuid := gen_random_uuid();
  v_event     record;
  v_zone      text;
  v_tz        text;
  v_starts    timestamptz;
  v_ends      timestamptz;
  v_closes_at timestamptz;
  v_win       jsonb;
  v_opens     timestamptz;
  v_closes    timestamptz;
  v_free_tier boolean := false;
  -- SCAN-1245: the database-side cap. Literals on purpose; see the header.
  v_hour_cap  constant integer := 60;
  v_day_cap   constant integer := 300;
  v_hour      integer;
  v_day       integer;
begin
  -- The ONLY branch that returns anything other than an opaque receipt. Same shape the app layer
  -- validates with, re-checked here because anon reaches this function directly over PostgREST.
  if v_email = '' or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return null;
  end if;

  select e.id, e.capacity, e.is_cancelled, e.starts_at, e.ends_at, e.visibility, e.join_mode,
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

    -- PROG-GD4: the door closes four hours past the end, the way checkInWindowOpen closes
    -- (lib/events/checkin-window.ts). No end, or an end before the start, means the start.
    if v_event.ends_at is not null then
      v_ends := (v_event.ends_at at time zone 'UTC') at time zone v_tz;
    end if;
    v_closes_at := greatest(coalesce(v_ends, v_starts), v_starts) + interval '4 hours';

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

    -- LIVE-318: the free tier, read ONLY on a tickets-mode event and ONLY when one is named. The
    -- tier must belong to THIS event (a tier id from another event is not an offer here). A tier
    -- that is gated to paying members or to the hosting Space's members is refused for a guest
    -- outright, with no membership read: a guest holds neither, by definition. `sold` counts
    -- succeeded purchases only, so this gate is the app's inventory gate and nothing more.
    if v_event.join_mode = 'tickets' and p_ticket_type_id is not null then
      select (t.active
              and t.pricing_mode = 'free'
              and not t.member_only
              and not t.space_members_only
              and t.space_tier_id is null
              and (t.quantity is null or t.sold < t.quantity))
        into v_free_tier
        from public.event_ticket_types t
       where t.id = p_ticket_type_id
         and t.event_id = v_event.id;
      v_free_tier := coalesce(v_free_tier, false);
    end if;
  end if;

  -- Every rejection below returns the receipt, NOT an error and NOT null: a caller must not be able
  -- to distinguish a real open event from a cancelled one, one whose door has closed, a private
  -- one, a ticketed one whose named tier is not a free tier, a draft, a removed one, one whose
  -- booking window has not opened or has closed, or an id that was never an event.
  --
  -- 2026-09-05 (scan2 L7-5): `status` and `removed_at` join the list. A draft is readable only by
  -- its poster, host and guide+ (20260613130000), and a removed event is on no page at all; neither
  -- may take a seat from a signed-out caller who happens to hold its uuid.
  --
  -- 2026-09-14 (LIVE-318): a tickets-mode event is refused UNLESS the caller named one of its free
  -- tiers (v_free_tier above). A sold-out, inactive, gated or foreign tier leaves it false, and the
  -- refusal is the same receipt as every other, so the tier list is not an oracle either.
  --
  -- 2026-09-14 (PROG-GD4): the time refusal is "the door has closed" (v_closes_at), no longer "the
  -- event has started". A guest standing in the room can say so from the printed QR.
  if v_event.id is null
     or v_event.is_cancelled
     or v_event.status is distinct from 'published'
     or v_event.removed_at is not null
     or now() >= v_closes_at
     or v_event.visibility not in ('public', 'unlisted')
     or (v_event.join_mode = 'tickets' and not v_free_tier)
     or (v_opens is not null and now() < v_opens)
     or (v_closes is not null and now() >= v_closes)
  then
    return v_receipt;
  end if;

  -- 2026-11-16 (SCAN-1245): the cap this door carries itself, because the app's per-IP limit is not
  -- on the path of a caller who posts to PostgREST directly. Only a NEW seat is counted or refused:
  -- an address that already holds a seat on this event writes no row below (it may only fill in a
  -- missing name), so it goes straight through. The refusal is the same receipt as every other.
  if not exists (
    select 1
      from public.event_rsvps r
     where r.event_id = p_event_id
       and r.guest_email is not null
       and lower(r.guest_email) = v_email
  ) then
    -- One counter per event at a time: without this, a burst of parallel calls would all read the
    -- same count and all pass. Transaction-scoped, so it is gone when this call returns.
    perform pg_advisory_xact_lock(hashtextextended('capture_guest_rsvp:' || p_event_id::text, 0));

    -- Seats this door wrote: a guest address, not minted by a paid ticket (from_ticket_id is the
    -- settled-purchase path, which has its own payment gate and is not reachable from here).
    select count(*) filter (where r.created_at > now() - interval '1 hour'),
           count(*)
      into v_hour, v_day
      from public.event_rsvps r
     where r.event_id = p_event_id
       and r.guest_email is not null
       and r.from_ticket_id is null
       and r.created_at > now() - interval '24 hours';

    if v_hour >= v_hour_cap or v_day >= v_day_cap then
      -- Loud on purpose: this line in the Postgres log is how anyone learns the cap fired.
      raise log 'capture_guest_rsvp: guest cap reached for event % (% in the last hour, % in the last 24 hours)',
        p_event_id, v_hour, v_day;
      return v_receipt;
    end if;
  end if;

  -- status starts at 'going' and enforce_event_rsvp_capacity() (20260610030000) demotes it to
  -- 'waitlist' when the room is full. That trigger reads only NEW.event_id and NEW.status, so the
  -- guest obeys the member rule because it is the SAME rule, not a copy of it.
  --
  -- approval_status keys on the host's setting, so a guest waits exactly as long as a member does.
  --
  -- A free-tier claim on a tickets-mode event lands here as the SAME row a free RSVP lands as. No
  -- event_tickets row is written and the tier's `sold` is untouched, which is what the member free
  -- path (setRsvpStatus) does too. The tier id is not stored: the seat is the claim.
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

comment on function public.capture_guest_rsvp(uuid, text, text, uuid) is
  'Anon door for a signed-out guest RSVP. Returns an opaque random uuid on every path except a malformed address (null), so it cannot answer "is this person going to this event". Refuses a draft, removed, cancelled, non-public or window-closed event with the same receipt, and refuses a ticketed event unless p_ticket_type_id names one of its active, ungated, unsold-out FREE tiers (LIVE-318). Stays open until four hours past the end, the check-in door''s own window (PROG-GD4). Carries its own rate cap (SCAN-1245): at most 60 new guest seats per event per rolling hour and 300 per rolling 24 hours, refused with the same receipt and logged; an address that already holds a seat is never counted or refused. A resubmit fills in a missing guest_name and never replaces one. Writes into event_rsvps so the capacity trigger and the host approval setting apply unchanged.';

-- The anon front door, unchanged by create or replace; restated so the verdict reads here (ADR-959: revoked by
-- name, then handed back to exactly the two browser roles the form runs as).
revoke execute on function public.capture_guest_rsvp(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.capture_guest_rsvp(uuid, text, text, uuid) to anon, authenticated;

commit;
