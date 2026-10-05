-- SCAN-696: a member could approve their own RSVP request, mark themselves attended and claim
-- hundreds of plus-ones by writing their RSVP row directly.
--
-- The write policies on event_rsvps (20270303000000, "crew+ insert own" and "crew+ update own")
-- decide only whose row it is: profile_id = private.get_my_profile_id() and the member floor.
-- No column grant is narrowed and no trigger rejects a value: the capacity trigger coerces
-- status, and the suspension trigger refuses a suspended member. So a member whose request is
-- pending on an approval-required event could, from the browser console, set approval_status to
-- approved (skipping the host queue), attended_at to now and attended_by to themselves (passing
-- checkInEvent, collecting practice.verified and Zaps, and counting as host-attested present in
-- space_standing.attendance), and plus_ones to 500. 20270345004300 assumed only the service role
-- writes attended_at; the update-own policy made that false.
--
-- THE FIX. One BEFORE INSERT OR UPDATE trigger, fired before the capacity trigger (same-event
-- triggers fire in name order, and trg_a_ sorts before trg_enforce_), that leaves the row alone
-- for the trusted writers and otherwise refuses the host's columns:
--
--   * service_role, postgres and supabase_admin pass unchanged: the admin client (approveRsvp,
--     setSeatAttended, the manage roster, the waitlist promotion) and every SECURITY DEFINER door
--     (capture_guest_rsvp, claim_guest_seat, release_guest_seat, all owned by postgres) keep
--     working. A row with no profile_id (a guest seat) passes too: a guest never reaches the table
--     except through those doors.
--   * Otherwise, on INSERT: approval_status must be none or pending, and attended_at, attended_by,
--     every guest_* column, seat_token_hash and from_ticket_id must be null.
--   * Otherwise, on UPDATE: none of those columns may change, and approval_status may only change
--     to pending (a member re-requesting after a decline), never to approved or back to none.
--   * Either way plus_ones stays within 0 and 5, the MAX_PLUS_ONES the app clamps to
--     (app/(main)/events/actions.ts setRsvpPlusOnes). The bound sits in the trigger rather than a
--     table CHECK so a service-role writer and the guest doors keep their own rules.
--
-- The error code is 42501 (insufficient_privilege), the same code the friendships identity freeze
-- raises (20270221000000): the write is refused for who is making it, not for what it says.
--
-- RLS AND GRANTS. No policy changes. The function is revoked from public, anon and authenticated:
-- a trigger function runs regardless of EXECUTE on its owner's behalf, and nobody else calls it.
--
-- ROLLBACK:
--   drop trigger if exists trg_a_event_rsvps_member_write_guard on public.event_rsvps;
--   drop function if exists public.event_rsvps_member_write_guard();
--
-- House style: idempotent (create or replace, drop trigger if exists). No em or en dashes.

-- SECURITY INVOKER, deliberately. Inside a SECURITY DEFINER function current_user is the owner
-- (postgres), so the trusted-writer branch below would admit every caller and the guard would be
-- a no-op; CI's first run of event_rsvps_member_write_guard.test.sql proved exactly that. As an
-- invoker function it sees the real writer: authenticated for a member, service_role for the
-- admin client, and postgres inside the postgres-owned SECURITY DEFINER doors.
create or replace function public.event_rsvps_member_write_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  max_plus_ones constant integer := 5;
begin
  -- The trusted writers: the admin client and every SECURITY DEFINER door, which run as their
  -- owner. The capacity and suspension triggers that follow still apply to them.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  -- A guest seat (no profile) only ever arrives through a postgres-owned door, so this branch
  -- is a belt for the braces above; it keeps the guest flows out of the member rules.
  if new.profile_id is null then
    return new;
  end if;

  if new.plus_ones is null or new.plus_ones < 0 or new.plus_ones > max_plus_ones then
    raise exception 'event_rsvps: plus_ones must be between 0 and %', max_plus_ones
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.approval_status not in ('none', 'pending') then
      raise exception 'event_rsvps: a member cannot approve their own seat'
        using errcode = '42501';
    end if;
    if new.attended_at is not null or new.attended_by is not null then
      raise exception 'event_rsvps: attendance is marked by the host'
        using errcode = '42501';
    end if;
    if new.guest_email is not null or new.guest_name is not null
       or new.guest_claimed_by is not null or new.guest_claimed_at is not null
       or new.seat_token_hash is not null or new.from_ticket_id is not null then
      raise exception 'event_rsvps: guest and ticket columns are set by the door, not the member'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: the host's columns are frozen for the member; approval may only go back to pending.
  if new.approval_status is distinct from old.approval_status and new.approval_status <> 'pending' then
    raise exception 'event_rsvps: a member cannot approve their own seat'
      using errcode = '42501';
  end if;
  if new.attended_at is distinct from old.attended_at or new.attended_by is distinct from old.attended_by then
    raise exception 'event_rsvps: attendance is marked by the host'
      using errcode = '42501';
  end if;
  if new.guest_email is distinct from old.guest_email
     or new.guest_name is distinct from old.guest_name
     or new.guest_claimed_by is distinct from old.guest_claimed_by
     or new.guest_claimed_at is distinct from old.guest_claimed_at
     or new.seat_token_hash is distinct from old.seat_token_hash
     or new.from_ticket_id is distinct from old.from_ticket_id then
    raise exception 'event_rsvps: guest and ticket columns are set by the door, not the member'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.event_rsvps_member_write_guard() from public;
revoke all on function public.event_rsvps_member_write_guard() from anon;
revoke all on function public.event_rsvps_member_write_guard() from authenticated;

drop trigger if exists trg_a_event_rsvps_member_write_guard on public.event_rsvps;
create trigger trg_a_event_rsvps_member_write_guard
  before insert or update on public.event_rsvps
  for each row execute function public.event_rsvps_member_write_guard();
