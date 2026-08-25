-- The capacity trigger counts SEATS, not requests, and it fires when the seat is actually taken
-- (SCAN-512 rank 1, ADR-1152).
--
-- 🔴 WHAT WAS WRONG, AND WHY SCAN-105 MADE IT WORSE RATHER THAN CAUSED IT.
-- `enforce_event_rsvp_capacity()` (20260610030000) has always counted every `status = 'going'` row
-- with no `approval_status` predicate:
--
--     select count(*) into going_count from public.event_rsvps
--      where event_id = NEW.event_id and status = 'going' and id <> NEW.id;
--
-- SCAN-105 (20270333000000) settled the question at the application layer: a pending request does
-- NOT hold a seat. `getCapacityInfo` and `event_going_counts` both exclude pending now. This
-- function is the SAME question answered the OLD way one layer down, and the database wins. So
-- today `getCapacityInfo` says "1 spot left", the member RSVPs, and this trigger — counting the
-- pending rows the app just learned to ignore — silently rewrites their status to 'waitlist'.
--
-- It also reproduces SCAN-105's own headline failure verbatim: with 20 pending requests on a
-- 20-seat event, the host cannot admit anyone, because their own event reads as full.
--
-- 🔴 AND THE SECOND HALF, WHICH IS THE ONE NOBODY HAD LOOKED AT. lib/events/rsvp-depth.ts says of
-- `approveRsvp`: "Approving does NOT force 'going' — the guest's chosen status stands and the
-- capacity trigger still applies if they're going."
--
-- ⚠️ THAT COMMENT IS FALSE, and has been for the whole life of the approval feature. The guard is
-- `if NEW.status = 'going' and (TG_OP = 'INSERT' or OLD.status is distinct from 'going')`. Approving
-- is an UPDATE that changes only `approval_status`, so OLD.status = NEW.status = 'going' and the
-- second condition is FALSE. The body never runs. There is NO capacity check at approval time at
-- all, which means a host can approve past a full room without anything noticing.
--
-- Put together, the old function had it exactly backwards: it charged a seat for a REQUEST (which
-- takes none) and charged nothing for an APPROVAL (which takes one).
--
-- ✅ WHAT IT BECOMES. The seat is taken when the RSVP is 'going' AND is not still waiting on the
-- host. That single sentence fixes both halves, because it is both the COUNT and the TRIGGER
-- CONDITION:
--   * a row that is itself pending is never demoted — it is not asking for a seat yet;
--   * a pending row is never counted against anyone else's seat;
--   * the pending -> approved transition now RE-ENTERS the check, because that is the moment the
--     seat is actually claimed. This is what finally makes rsvp-depth.ts's comment true.
--
-- A host approving into a full room now lands that person on the waitlist rather than over-filling
-- the event. That is the same coercion this trigger has always applied at insert, applied at the
-- moment it now correctly identifies as the claim.
--
-- ⚠️ WHY A GUEST OBEYS IT TOO, unchanged: `capture_guest_rsvp` (20270328000000) inserts
-- `status = 'going'` with `approval_status` keyed to the host's setting and leans on THIS trigger
-- for capacity, noting "the guest obeys the member rule because it is the SAME rule, not a copy of
-- it." That stays true and gets better: a guest's pending request stops consuming a seat as well.
--
-- ⚠️ LATENT TODAY: production carries 0 events with `rsvp_requires_approval` and 0 rows at
-- `approval_status = 'pending'`, so every path above is unreachable right now. That is exactly when
-- it is cheap - the same argument 20270334000000 was written on.
--
-- ROLLBACK: restore the body from 20260610030000.

begin;

create or replace function public.enforce_event_rsvp_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap         int;
  going_count int;
begin
  -- THE SEAT IS TAKEN when the RSVP is going and is not still waiting on the host. Both arms of
  -- the guard below read from that one sentence.
  if NEW.status = 'going'
     and NEW.approval_status is distinct from 'pending'
     and (
       TG_OP = 'INSERT'
       -- became 'going'
       or OLD.status is distinct from 'going'
       -- or was approved into the room: the moment the seat is actually claimed. Without this arm
       -- there is no capacity check at approval time at all.
       or OLD.approval_status is distinct from NEW.approval_status
     )
  then
    select capacity into cap from public.events where id = NEW.event_id;
    if cap is not null then
      select count(*) into going_count
        from public.event_rsvps
       where event_id = NEW.event_id
         and status = 'going'
         -- A request is not a seat. This is SCAN-105's ruling, stated where the database enforces it.
         and approval_status is distinct from 'pending'
         and id <> NEW.id;
      if going_count >= cap then
        NEW.status := 'waitlist';
      end if;
    end if;
  end if;
  return NEW;
end;
$$;

-- PROVE THE BEHAVIOUR, not the text. A `pg_get_functiondef` grep for 'approval_status' would pass
-- on a function that mentions the column and still counts wrong, which is the shape-not-truth
-- failure this repo keeps buying. So the control below actually RSVPs against a real gated event
-- and asserts what each row's status becomes, then removes every row it made.
do $$
declare
  v_ev   uuid := gen_random_uuid();
  v_a    uuid;
  v_b    uuid;
  v_c    uuid;
  v_stat text;
begin
  insert into public.events (id, title, slug, scope_id, scope_type, starts_at, capacity, rsvp_requires_approval)
  values (v_ev, 'capacity probe', 'capacity-probe-' || replace(v_ev::text, '-', ''),
          gen_random_uuid(), 'public', now() + interval '30 days', 2, true);

  -- THREE pending requests on a TWO seat event. None may be demoted: a request is not a seat, and
  -- the old function would have waitlisted the third here.
  insert into public.event_rsvps (event_id, guest_email, guest_name, status, approval_status)
  values (v_ev, 'a@probe.invalid', 'A', 'going', 'pending') returning id into v_a;
  insert into public.event_rsvps (event_id, guest_email, guest_name, status, approval_status)
  values (v_ev, 'b@probe.invalid', 'B', 'going', 'pending') returning id into v_b;
  insert into public.event_rsvps (event_id, guest_email, guest_name, status, approval_status)
  values (v_ev, 'c@probe.invalid', 'C', 'going', 'pending') returning id into v_c;

  select string_agg(distinct status, ',') into v_stat from public.event_rsvps where event_id = v_ev;
  if v_stat is distinct from 'going' then
    raise exception 'a pending REQUEST was charged a seat: statuses are %, expected every row still going', v_stat;
  end if;

  -- Approve the first two. Both fit.
  update public.event_rsvps set approval_status = 'approved' where id = v_a;
  update public.event_rsvps set approval_status = 'approved' where id = v_b;
  select status into v_stat from public.event_rsvps where id = v_b;
  if v_stat is distinct from 'going' then
    raise exception 'the second approval into a two seat event was demoted to %, so the count is still charging requests', v_stat;
  end if;

  -- Approve the third. The room is genuinely full now, so this one waits. Under the OLD function
  -- this update never re-entered the trigger and the event would have been over-filled.
  update public.event_rsvps set approval_status = 'approved' where id = v_c;
  select status into v_stat from public.event_rsvps where id = v_c;
  if v_stat is distinct from 'waitlist' then
    raise exception 'approving into a FULL event left status %, expected waitlist - approval is not re-entering the capacity check', v_stat;
  end if;

  delete from public.event_rsvps where event_id = v_ev;
  delete from public.events where id = v_ev;
end $$;

commit;
