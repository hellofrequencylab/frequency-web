-- SEC-027: a member cannot take a free seat on a ticketed event by RSVPing "going".
--
-- THE GAP. An event that sells tickets (a price or an active ticket type, and join_mode is not
-- 'rsvp') is in tickets mode (lib/events/public-join-door.ts). The page hides the RSVP control there,
-- but neither setRsvpStatus (app/(main)/events/actions.ts) nor the RLS policy "event_rsvps: crew+
-- insert own" asks about price, and the member write guard (SCAN-696, SCAN-844) checks
-- approval, attendance and guest columns only. So a member could insert or update their own row to
-- status 'going' (or 'waitlist') through the action or PostgREST. isAdmitted() counts that as a seat:
-- it unlocks a hidden address and the private online link (canAccessEventOnlineLink) and passes the
-- door check-in, all without a ticket. Production holds no such seat today (40 ticketed events, 0
-- member 'going' rows without a ticket, read 2026-11-19).
--
-- THE FIX. A second BEFORE trigger on event_rsvps (the existing member write guard is left as is)
-- adds one rule for caller roles: on a ticketed event, a member's
-- own row may not become 'going' or 'waitlist' unless it came from a ticket (from_ticket_id, written
-- only by the ticket doors) or the member hosts or co-hosts the event. Ticket purchase, the member
-- benefit claim and host writes run as the owner or the service role and stay exempt. 'not_going'
-- and interest stay free. private.event_sells_tickets is the read, SECURITY DEFINER so the guard
-- sees ticket types and co-hosts whatever the caller's RLS.
--
-- ROLLBACK: drop trigger if exists trg_b_event_rsvps_ticket_seat on public.event_rsvps;
--   drop function if exists public.guard_event_rsvp_ticket_seat();
--   drop function if exists private.event_sells_tickets(uuid, uuid);

begin;

create or replace function private.event_sells_tickets(p_event_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and e.join_mode is distinct from 'rsvp'
      and (coalesce(e.price_cents, 0) > 0
           or exists (select 1 from public.event_ticket_types t where t.event_id = e.id and t.active))
      and e.host_id is distinct from p_profile_id
      and not exists (
        select 1 from public.event_cohosts c
        where c.event_id = e.id and c.profile_id = p_profile_id and c.status = 'accepted'
      )
  );
$$;

comment on function private.event_sells_tickets(uuid, uuid) is
  'SEC-027. True when the event is in tickets mode (a price or an active ticket type, join_mode not rsvp) and the profile neither hosts nor co-hosts it, so a seat must come from a ticket. Read by the ticket seat trigger on event_rsvps.';

-- The seat trigger is SECURITY INVOKER, so the member's role calls this; private is not exposed by the API.
revoke execute on function private.event_sells_tickets(uuid, uuid) from public, anon;
grant execute on function private.event_sells_tickets(uuid, uuid) to authenticated;

create or replace function public.guard_event_rsvp_ticket_seat()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
begin
  -- Trusted writers: the admin client, the migration runner, and every SECURITY DEFINER door
  -- (ticket purchase, the member benefit claim, host tools), which run as their owner.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  -- A guest seat has no member behind it; the caller policies already refuse it.
  if new.profile_id is null then
    return new;
  end if;

  -- SEC-027: on a ticketed event a seat comes from a ticket. A member's own write may not make the
  -- row 'going' or 'waitlist' (both count as admitted) unless a ticket door already linked it.
  if new.status in ('going', 'waitlist')
     and new.from_ticket_id is null
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and private.event_sells_tickets(new.event_id, new.profile_id) then
    raise exception 'event_rsvps: this event sells tickets, so a seat comes with a ticket'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_event_rsvp_ticket_seat() is
  'SEC-027. BEFORE INSERT OR UPDATE on event_rsvps: a member cannot RSVP going or waitlist on a ticketed event without a ticket. Not an RPC.';

revoke all on function public.guard_event_rsvp_ticket_seat() from public, anon, authenticated;

drop trigger if exists trg_b_event_rsvps_ticket_seat on public.event_rsvps;
create trigger trg_b_event_rsvps_ticket_seat
  before insert or update on public.event_rsvps
  for each row execute function public.guard_event_rsvp_ticket_seat();

commit;
