-- SCAN-696: a member cannot approve their own RSVP request, mark themselves attended, or claim
-- hundreds of plus-ones by writing their RSVP row directly.
--
-- THE GAP. The write policies on event_rsvps decide only WHOSE row it is: "crew+ insert own" and
-- "crew+ update own" (20270303000000) check profile_id = private.get_my_profile_id() and the member
-- role, nothing else. No migration ever narrowed the column grants (authenticated holds INSERT and
-- UPDATE on every column, including attended_at), the capacity trigger never rejects a value, and
-- the suspension trigger only asks whether the writer is suspended. 20270345004300 said "the only
-- writer of attended_at is the manage action on the service role": the update-own policy made that
-- false from the first day. So a member whose request is pending on an approval-required event
-- could PATCH their own row from the browser console with approval_status = 'approved',
-- attended_at = now(), attended_by = themselves and plus_ones = 500. RLS let it through: they
-- skipped the host queue, passed checkInEvent's admission read, collected practice.verified and
-- Zaps, and counted as host-attested present in space_standing.attendance (20270345009300).
--
-- THE FIX. A BEFORE INSERT OR UPDATE trigger that applies to the CALLER ROLES ONLY. It returns NEW
-- untouched when current_user is service_role, postgres or supabase_admin (the admin client, the
-- migration runner, and every SECURITY DEFINER door: capture_guest_rsvp, update_guest_seat,
-- claim_guest_rsvps, record_ticket_seat, refund_ticket_atomic all run as their owner), and when
-- NEW.profile_id is null (a guest seat, which the caller policies already refuse). For a member
-- writing their own row through the policy it then holds the line the app holds:
--
--   INSERT  approval_status is 'none' or 'pending' (never 'approved'), and attended_at,
--           attended_by, guest_email, guest_name, guest_claimed_by, guest_claimed_at,
--           seat_token_hash and from_ticket_id are all null. These are the columns only the host,
--           staff or a definer door writes; a seat someone makes themselves starts with none.
--   UPDATE  none of those columns changes, and approval_status changes only TO 'pending' (the
--           re-join path in app/(main)/events/actions.ts writes exactly that; the host's approve
--           action writes 'approved' on the service role and is exempt above).
--
-- The function is SECURITY INVOKER on purpose. Inside a SECURITY DEFINER function current_user is
-- the OWNER, so a definer trigger function would read 'postgres' on every write and the exemption
-- would be the whole function. INVOKER keeps the caller's role: 'authenticated' for a member
-- through PostgREST, the owner for a definer door, 'service_role' for the admin client.
--
-- The trigger is named to sort BEFORE trg_enforce_event_rsvp_capacity and
-- trg_event_rsvps_block_suspended (Postgres fires same-event row triggers in name order): a forged
-- write is refused before the capacity trigger takes the event row lock for it.
--
-- plus_ones gains a ceiling. The app clamps to 5 (MAX_PLUS_ONES in app/(main)/events/actions.ts,
-- MAX_GUEST_PLUS_ONES in lib/events/guest-seat.ts) and the live table holds nothing above 0, so the
-- existing floor-only check becomes a 0..5 check for every writer.
--
-- ROLLBACK:
--   drop trigger if exists trg_a_event_rsvps_member_write_guard on public.event_rsvps;
--   drop function if exists public.guard_event_rsvp_member_write();
--   alter table public.event_rsvps drop constraint if exists event_rsvps_plus_ones_check;
--   alter table public.event_rsvps add constraint event_rsvps_plus_ones_check check (plus_ones >= 0);
--
-- House style: idempotent (create or replace, drop trigger if exists), pinned search_path, revoke
-- by role name then no grant back (a trigger function needs no EXECUTE from a client role).
-- No em or en dashes. pgTAP: supabase/tests/event_rsvps_member_write_guard.test.sql.

begin;

-- ── 1. The guard ─────────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_event_rsvp_member_write()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Trusted writers: the admin client, the migration runner, and every SECURITY DEFINER door
  -- (which runs as its owner). They are the only writers of the columns frozen below.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  -- A guest seat has no member behind it; the caller policies already refuse it, and the definer
  -- doors that do write it were exempted above.
  if new.profile_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.approval_status not in ('none', 'pending')
       or new.attended_at      is not null
       or new.attended_by      is not null
       or new.guest_email      is not null
       or new.guest_name       is not null
       or new.guest_claimed_by is not null
       or new.guest_claimed_at is not null
       or new.seat_token_hash  is not null
       or new.from_ticket_id   is not null then
      raise exception 'event_rsvps: a member seat starts unapproved, unattended and with no guest, token or ticket columns set'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: the host-attested and door-written columns never change under a caller role, and
  -- approval moves only toward the queue, never past it.
  if new.attended_at      is distinct from old.attended_at
  or new.attended_by      is distinct from old.attended_by
  or new.guest_email      is distinct from old.guest_email
  or new.guest_name       is distinct from old.guest_name
  or new.guest_claimed_by is distinct from old.guest_claimed_by
  or new.guest_claimed_at is distinct from old.guest_claimed_at
  or new.seat_token_hash  is distinct from old.seat_token_hash
  or new.from_ticket_id   is distinct from old.from_ticket_id then
    raise exception 'event_rsvps: attended_at, attended_by, guest_*, seat_token_hash and from_ticket_id are written by the host or a door, never by the seat holder'
      using errcode = '42501';
  end if;

  if new.approval_status is distinct from old.approval_status
     and new.approval_status <> 'pending' then
    raise exception 'event_rsvps: only the host admits a request (approval_status may only move to pending)'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_event_rsvp_member_write() is
  'BEFORE INSERT OR UPDATE on event_rsvps (SCAN-696). Under a caller role (authenticated, anon) a member seat may not be inserted approved or attended, and attended_at, attended_by, guest_*, seat_token_hash, from_ticket_id and approval_status (except a move to pending) may not change. Exempt: service_role, postgres, supabase_admin (the admin client and every SECURITY DEFINER door) and rows with no profile_id. SECURITY INVOKER by design: a definer body would read its owner as current_user and exempt every write.';

revoke execute on function public.guard_event_rsvp_member_write() from public, anon, authenticated;

-- Named to fire first: "trg_a_" sorts before "trg_e" (capacity) and "trg_ev" (suspension).
drop trigger if exists trg_a_event_rsvps_member_write_guard on public.event_rsvps;
create trigger trg_a_event_rsvps_member_write_guard
  before insert or update on public.event_rsvps
  for each row execute function public.guard_event_rsvp_member_write();

-- ── 2. plus_ones has a ceiling, for every writer ─────────────────────────────────────────────────

alter table public.event_rsvps drop constraint if exists event_rsvps_plus_ones_check;
alter table public.event_rsvps add constraint event_rsvps_plus_ones_check
  check (plus_ones between 0 and 5);

commit;
