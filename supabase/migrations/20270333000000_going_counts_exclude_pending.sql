-- A pending approval request stops counting as a going seat (SCAN-105, ADR-1148, owner ruling).
--
-- 🔴 THE RULE, and it is the owner's: APPROVAL GATES THE SEAT. On an approval-gated event an
-- unapproved answer is written as `status = 'going'` with `approval_status = 'pending'`, so counting
-- status alone let TWENTY unapproved REQUESTS fill a twenty-seat event the host had not said yes to
-- — and the host could then not approve anyone, because their own event read as full.
--
-- It also contradicted the published promise. content/help/groups/events.md tells hosts "A full event
-- still sends approved people to the waitlist. Approving says 'yes, you are welcome', not 'there is
-- room'", which is only true if approval, not the request, is what consumes the seat.
--
-- THIS FUNCTION IS THE SERVER HALF. The application half is getCapacityInfo + promoteFromWaitlist
-- (lib/events/capacity.ts) and the paged fallback in lib/events/going-counts.ts, all carrying the same
-- predicate. They must stay in lockstep: this count drives the "Has open spots" facet and the
-- Popularity sort on /events, so a disagreement between the RPC and its own fallback would make the
-- listing depend on whether the migration had been applied.
--
-- ✅ `approval_status` is NOT NULL with DEFAULT 'none' (verified on production 2026-08-25), so a plain
-- `<> 'pending'` is COMPLETE rather than merely careful: every ungated RSVP carries 'none' and is
-- counted, and only 'pending' is withheld. No null branch is needed, and adding one would suggest a
-- state that cannot exist.
--
-- ⚠️ MEASURED BEFORE CHANGING: production carries 0 events with rsvp_requires_approval, 0 rows at
-- approval_status 'pending', and the only value present is 'none'. So this changes NO current count.
-- It closes the rule before the first gated event exists rather than after — the opposite of how the
-- truncation class in ADR-962/969 was always found.
--
-- ROLLBACK: re-apply 20270329000000's body (this differs from it only by the added predicate).

begin;

create or replace function public.event_going_counts(p_event_ids uuid[])
returns table (event_id uuid, going integer)
language sql
security definer
set search_path = ''
stable
as $$
  select r.event_id, count(*)::int as going
  from public.event_rsvps r
  where r.event_id = any(p_event_ids)
    and r.status = 'going'
    and r.approval_status <> 'pending'
  group by r.event_id;
$$;

comment on function public.event_going_counts(uuid[]) is
  'Events listing: confirmed going-RSVP count per event, aggregated server-side for a bounded set of event ids. Excludes approval_status = pending, because a request the host has not approved does not hold a seat (SCAN-105). Replaces a whole-listing read of public.event_rsvps that both scaled with total attendance and truncated at PostgREST max_rows. SECURITY DEFINER, service_role only; the viewer gate stays on the calling loader.';

revoke all on function public.event_going_counts(uuid[]) from public;
revoke all on function public.event_going_counts(uuid[]) from anon, authenticated;
grant execute on function public.event_going_counts(uuid[]) to service_role;

-- PROVE THE PREDICATE ON SYNTHETIC ROWS, created here and rolled back, so the check is unconditional
-- and holds on the EMPTY database `db-tests` replays against as well as on a populated one. The two
-- migrations before this one shipped controls that needed pre-existing rows and went red there.
do $$
declare
  v_ev uuid := gen_random_uuid();
  v_going int;
begin
  -- scope_id is NOT NULL on events (no FK, so any uuid satisfies it) and scope_type must be set
  -- with it. 20270332000000's probe already learned this the same way — by failing atomically first.
  insert into public.events (id, title, slug, scope_id, scope_type, starts_at, capacity)
  values (v_ev, 'approval probe', 'approval-probe-' || replace(v_ev::text, '-', ''),
          gen_random_uuid(), 'public', now() + interval '30 days', 2);

  -- One approved seat, one ungated seat, and one PENDING request that must not be counted.
  insert into public.event_rsvps (event_id, guest_email, status, approval_status)
  values (v_ev, 'approved@example.test', 'going', 'approved'),
         (v_ev, 'ungated@example.test',  'going', 'none'),
         (v_ev, 'pending@example.test',  'going', 'pending');

  select going into v_going from public.event_going_counts(array[v_ev]) limit 1;
  if v_going is null then
    raise exception 'event_going_counts returned no row for an event with three going RSVPs';
  end if;
  if v_going <> 2 then
    raise exception 'event_going_counts returned %, expected 2 (the pending request must not hold a seat)', v_going;
  end if;

  raise exception 'probe complete, rolling back the synthetic rows';
exception when others then
  if sqlerrm <> 'probe complete, rolling back the synthetic rows' then
    raise;
  end if;
end $$;

commit;
