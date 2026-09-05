-- space_ticket_rsvps gets a DB-side capacity guard (ADR-TBD, meta-scan L6-07).
--
-- THE DEFECT. A Space's ticket tier could be overbooked. rsvpToTier (lib/spaces/tickets.ts) counted
-- the going RSVPs on a tier in JavaScript, compared the count to space_ticket_tiers.capacity, and
-- then inserted. Nothing on the table itself enforced the cap: no trigger, no RPC, no lock. Two
-- members clicking "Reserve a spot" on the last seat both passed the JS count (each read
-- capacity - 1 going rows) and both inserts landed, so the tier read capacity + 1 going. This is
-- exactly the race the event path (enforce_event_rsvp_capacity, 20260610030000) and the Circle path
-- (enforce_circle_member_cap, 20260726000000) already close with a BEFORE trigger, and the ticket
-- path closes with reserve_ticket_atomic. space_ticket_rsvps was the one seat table without one.
--
-- THE FIX. A BEFORE INSERT OR UPDATE trigger that:
--   1. only acts when the row is BECOMING going (an insert with status going, or an update that
--      moves a non-going row to going); a cancel, or an edit that leaves a going row going, is free;
--   2. locks the TIER row (select ... for update) so two concurrent reservations on one tier
--      serialise on that lock and the second one counts the first one's row;
--   3. counts the going rows on the tier, excluding NEW.id so an update never counts itself;
--   4. raises 'tier_full' with sqlstate 23514 (check_violation) when the count already meets the
--      capacity. A NULL capacity means unlimited and is never enforced.
--
-- WHY RAISE AND NOT WAITLIST. event_rsvps has a 'waitlist' status and its trigger demotes the row
-- into it. space_ticket_rsvps.status is CHECK-constrained to ('going', 'cancelled') and nothing in
-- the app reads a waitlist for a Space tier, so flipping the status would write a value the CHECK
-- rejects and the UI cannot render. rsvpToTier already carries the member-facing message for a full
-- tier ("This ticket is full. Try another tier."); it now maps this exception onto that message, so
-- the concurrent loser sees the same words the JS pre-check shows the sequential one.
--
-- THE JS PRE-CHECK STAYS. It is the fast path that answers a full tier without a write attempt; this
-- trigger is the guard that holds when two of those fast paths race.
--
-- ACL. A trigger function is fired by the trigger, never called over PostgREST, but Supabase's default
-- privileges still hand anon and authenticated EXECUTE on every new public function. Revoked
-- role-explicit below (ADR-959, scripts/check-function-grants.mjs models a public-only revoke as a
-- no-op). Verdict for scripts/function-grants.txt: internal.
--
-- House style: additive + idempotent (create or replace, drop trigger if exists). No em or en dashes.
-- Ledger: apply through MCP, then repair the ledger row to THIS version (supabase/migrations/README.md,
-- the two-step protocol).

begin;

create or replace function public.enforce_space_ticket_tier_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cap   integer;
  v_going integer;
begin
  -- Only a row that is BECOMING going consumes a seat. A cancel, or an update that leaves a going
  -- row going (nothing in the app does that today), never re-counts.
  if NEW.status is distinct from 'going' then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.status = 'going' then
    return NEW;
  end if;

  -- Lock the tier row so concurrent reservations on one tier serialise here. The second transaction
  -- blocks on this select until the first commits, then counts the first's row below.
  select t.capacity
    into v_cap
    from public.space_ticket_tiers t
   where t.id = NEW.tier_id
     for update;

  -- No tier row (the FK will reject the insert anyway) or NULL capacity (unlimited): nothing to hold.
  if v_cap is null then
    return NEW;
  end if;

  select count(*)
    into v_going
    from public.space_ticket_rsvps r
   where r.tier_id = NEW.tier_id
     and r.status = 'going'
     and r.id <> NEW.id;

  if v_going >= v_cap then
    raise exception 'tier_full' using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

comment on function public.enforce_space_ticket_tier_capacity() is
  'BEFORE INSERT OR UPDATE guard on space_ticket_rsvps: locks the tier row, counts going RSVPs (excluding the row itself) and raises tier_full (sqlstate 23514) when the tier is at capacity. NULL capacity = unlimited. rsvpToTier in lib/spaces/tickets.ts maps tier_full onto its "This ticket is full" message. Trigger function, never called directly; service-role only.';

drop trigger if exists trg_enforce_space_ticket_tier_capacity on public.space_ticket_rsvps;
create trigger trg_enforce_space_ticket_tier_capacity
  before insert or update on public.space_ticket_rsvps
  for each row execute function public.enforce_space_ticket_tier_capacity();

-- Trigger function: fired by the trigger, never an RPC. Role-explicit revoke (ADR-959).
revoke execute on function public.enforce_space_ticket_tier_capacity() from public, anon, authenticated;

commit;

-- Rollback: drop trigger if exists trg_enforce_space_ticket_tier_capacity on public.space_ticket_rsvps;
-- drop function if exists public.enforce_space_ticket_tier_capacity();
-- The table, its CHECK and its partial unique index are untouched by this file, so nothing else
-- needs restoring; the tier simply goes back to being guarded by the JS count alone.
