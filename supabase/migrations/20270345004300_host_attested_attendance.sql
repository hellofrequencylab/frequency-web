-- PROG-GD4: host-attested attendance in its own column, and the guest RSVP door stays open while
-- the check-in door is.
--
-- THE GAP. Event attendance had exactly one record: the engagement-ledger row that
-- checkInEvent (app/(main)/events/actions.ts) writes when a SIGNED-IN member checks themselves in,
-- and that row is written by the path that pays Zaps, ticks a streak and marks the member verified.
-- There was no way to say "this person was in the room" without paying them for saying so, and no
-- way to say it about anyone without a profile: a guest RSVP (event_rsvps.guest_email, no profile,
-- 20270303000000) or a guest ticket holder (event_tickets.guest_email, no buyer, 20270345003400) can
-- never appear in a ledger keyed on actor_profile_id. The host's roster read that ledger and showed
-- "Checked in" for members and nothing for anyone else. PROG-R11, the field test, is blocked on
-- exactly this number: attendance with an independent record.
--
-- THE MECHANISM. The mark lives on the SEAT, which is the row the roster already reads. A seat is
-- either an RSVP row (members, guest RSVPs, free-tier guest claims) or a succeeded ticket row (a
-- member or guest who paid on a tickets-mode event, where no RSVP row exists, LIVE-317). Both
-- tables gain the same two columns, named identically the way the reminder stamps are
-- (20270345004100), so one app type names a column on both:
--
--   attended_at   when the host marked this seat as present
--   attended_by   the profile that marked it (the host, a cohost, or platform staff)
--
-- The host marks a seat from the roster (app/(main)/events/[slug]/manage/attendance-actions.ts,
-- gated on host authority through lib/events/host-gate and cohost standing). The write is an
-- update of these two columns and NOTHING else: no engagement_events row, no Zaps, no streak, no
-- verified-member standing. The self check-in path is untouched and keeps paying as it did; the
-- roster shows the two marks side by side, because they answer two different questions ("did they
-- log it" and "did the host see them").
--
-- A separate event_attendance table was considered and rejected: the seat rows can carry the
-- mark, a table would need its own RLS, grants and a (kind, id) join back to the seat for every
-- roster read, and the reminder stamps already set the precedent of twin columns on the two seat
-- tables.
--
-- THE SECOND HALF: capture_guest_rsvp. The anon door refused any event whose start had passed
-- (v_starts <= now(), since 20270303000100), while the event page has rendered the guest RSVP form
-- beside the check-in door for a LIVE event since ADR-1033 was rescoped ("a guest arriving on a
-- shared link mid-event can still say they are coming"). The form was shown; the SQL refused with
-- the opaque receipt; the guest read "Check your email" and no seat, no email and no roster row
-- existed. That is the ADR-1150 failure shape, and this row makes it the main path: a printed QR
-- scanned while signed out now lands on that form (app/q/[slug]/route.ts). So the refusal moves
-- from "has started" to "the door has closed": the same window checkInWindowOpen
-- (lib/events/checkin-window.ts) uses, open from the start and shut four hours past the end
-- (ends_at, or starts_at when the host set no end; an end before the start falls back to the start,
-- same as the app). Every other check in the function is byte for byte 20270345004000: the address
-- shape, draft / removed / cancelled / private, the booking window, the free tier, the capacity
-- trigger, the approval setting, the opaque receipt, and the resubmit rule.
--
-- WHY create or replace and not drop: the signature (uuid, text, text, uuid) is unchanged, so the
-- ACL survives. The revoke/grant pair is restated anyway so the verdict is readable here.
--
-- RLS AND GRANTS, explicit. No policy change and no grant change on either table: the columns sit
-- on tables whose policies already exist (event_rsvps: a member reads their own row and the host
-- reads the event's; event_tickets: the buyer and the host). The only writer is the manage action
-- on the service role. A timestamp and a profile id on a row the reader can already see gate
-- nothing. attended_by is indexed because every FK to profiles is (ADR-856).
--
-- ROLLBACK:
--   drop index if exists public.event_rsvps_attended_by_idx;
--   drop index if exists public.event_tickets_attended_by_idx;
--   alter table public.event_rsvps   drop column if exists attended_at, drop column if exists attended_by;
--   alter table public.event_tickets drop column if exists attended_at, drop column if exists attended_by;
--   then re-run the `create or replace function public.capture_guest_rsvp(...)` block and the
--   revoke/grant pair of 20270345004000_guest_free_tier_claim.sql (the door refuses a started event
--   again). The app half (the manage roster and its action select and update these columns by name)
--   must roll back in the SAME deploy or it fails with PGRST204.
--
-- House style: additive and idempotent (add column if not exists, create index if not exists,
-- create or replace). SECURITY DEFINER with a pinned search_path. No em or en dashes.

begin;

-- ── 1. The mark, on both seat tables ────────────────────────────────────────────────────────────

alter table public.event_rsvps
  add column if not exists attended_at timestamptz,
  add column if not exists attended_by uuid references public.profiles(id) on delete set null;

alter table public.event_tickets
  add column if not exists attended_at timestamptz,
  add column if not exists attended_by uuid references public.profiles(id) on delete set null;

comment on column public.event_rsvps.attended_at is
  'When the host marked this seat as present (PROG-GD4). Host-attested, written from the roster by the manage action on the service role; independent of the self check-in ledger row and never pays Zaps. Covers a member seat, a guest RSVP and a free-tier guest claim alike.';
comment on column public.event_rsvps.attended_by is
  'The profile that marked attended_at: the host, a cohost, or platform staff (PROG-GD4). Null once cleared or when that profile is gone.';
comment on column public.event_tickets.attended_at is
  'When the host marked this ticket holder as present (PROG-GD4). Same meaning as event_rsvps.attended_at; carried here because a ticket holder on a tickets-mode event, member or guest, has no RSVP row.';
comment on column public.event_tickets.attended_by is
  'The profile that marked attended_at (PROG-GD4). Null once cleared or when that profile is gone.';

create index if not exists event_rsvps_attended_by_idx
  on public.event_rsvps (attended_by)
  where attended_by is not null;

create index if not exists event_tickets_attended_by_idx
  on public.event_tickets (attended_by)
  where attended_by is not null;

-- ── 2. The guest door stays open while the check-in door is ─────────────────────────────────────

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
  'Anon door for a signed-out guest RSVP. Returns an opaque random uuid on every path except a malformed address (null), so it cannot answer "is this person going to this event". Refuses a draft, removed, cancelled, non-public or window-closed event with the same receipt, and refuses a ticketed event unless p_ticket_type_id names one of its active, ungated, unsold-out FREE tiers (LIVE-318). Stays open until four hours past the end, the check-in door''s own window (PROG-GD4), so a guest scanning the printed QR in the room can take a seat the host then marks attended. A resubmit fills in a missing guest_name and never replaces one. Writes into event_rsvps so the capacity trigger and the host approval setting apply unchanged.';

-- The anon front door: revoked by name (a `from public` alone leaves Supabase's per-role default
-- grants standing, ADR-959), then handed back to exactly the two browser roles the form runs as.
-- Unchanged by create or replace; restated so the verdict reads here.
revoke execute on function public.capture_guest_rsvp(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.capture_guest_rsvp(uuid, text, text, uuid) to anon, authenticated;

commit;
