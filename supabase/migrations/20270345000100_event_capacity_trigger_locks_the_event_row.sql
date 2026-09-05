-- The capacity trigger locks the event row, so two concurrent RSVPs cannot both take the last seat
-- (scan2 L6-01, P1). And the first-RSVP gem reward gets the daily cap it always needed (L6-06, P2).
--
-- ── L6-01: A CHECK-THEN-WRITE WITH NO LOCK IS NOT A GUARD ────────────────────────────────────────
--
-- `enforce_event_rsvp_capacity()` (20260610030000, body last rewritten by 20270336000000) is the
-- layer the app calls "the final say" on capacity. Its body is
--
--     select capacity into cap from public.events where id = NEW.event_id;
--     select count(*) into going_count from public.event_rsvps where ... and id <> NEW.id;
--     if going_count >= cap then NEW.status := 'waitlist'; end if;
--
-- with no lock on anything. Under READ COMMITTED two BEFORE INSERT triggers running at the same
-- moment each count the OTHER session's uncommitted row as absent: on a one-seat event with zero
-- going, both read going_count = 0, both keep status = 'going', both commit. The room is over
-- capacity by one and the host sees N+1 confirmed on an N-seat event. The application-side
-- `getCapacityInfo` (lib/events/capacity.ts) is the same count-then-insert one layer up and leans
-- on this trigger, so nothing above it catches the race either. Reproduction: the two-session
-- script beside the scan row (two psql sessions, expect 1 going + 1 waitlist, get 2 going).
--
-- THE FIX IS ONE CLAUSE. The circle cap guard written in the same day-series
-- (`enforce_circle_member_cap`, 20260726000000 ~line 185) already does this right:
--
--     select member_cap into v_cap from public.circles where id = NEW.circle_id for update;
--
-- Locking the parent row serialises every concurrent insert on the same event: the second
-- session blocks at the SELECT until the first commits, then re-reads and counts the committed
-- row, and lands on the waitlist. So the events read below takes `for update`, and NOTHING ELSE
-- in the body changes: the guard condition, the approval predicate, the count and the coercion
-- are copied verbatim from 20270336000000 so a diff between the two function bodies shows exactly
-- one hunk (the lock plus the comment above it). The function name is unchanged, so the trigger
-- attach statement from 20260610030000 (`trg_enforce_event_rsvp_capacity`, BEFORE INSERT OR
-- UPDATE) keeps pointing at it and is not restated here.
--
-- ⚠️ THE LOCK IS ON `events`, NOT `event_rsvps`. A guest RSVP (capture_guest_rsvp, 20270328000000)
-- and a member RSVP both insert into event_rsvps and both fire this trigger, so both take the same
-- event-row lock and serialise against each other. That is the point: capacity is one question,
-- and the guest obeys the member rule because it is the SAME rule. The lock is held for the rest
-- of the inserting transaction only (a single-row insert), so contention is one RSVP wide.
--
-- Events with `capacity is null` (unlimited) still take the lock and then return without counting,
-- which is the cheapest place to put the branch: the alternative (read without lock, then lock
-- only if capped) is the very read-then-lock gap this file closes.
--
-- ── L6-06: `event_rsvp` PAYS TWICE ON A DOUBLE-SUBMITTED FIRST RSVP ──────────────────────────────
--
-- The first-RSVP gem reward is `awardGems(profileId, 'event_rsvp')` in app/(main)/events/actions.ts
-- and its row in gem_config was seeded with `daily_cap = null` (20240120000000, re-asserted by
-- 20260605100000). `award_gems_atomic` (20260929000000) only counts against a cap when
-- `_daily_cap is not null`, so a double-submitted RSVP (two tabs, a retried fetch, a slow-network
-- double POST) whose two requests both read "no existing row" pays 5 gems twice. The cap mechanism
-- the RPC supports is per (profile, action) per UTC day, so the cap is 1: one event_rsvp gem award
-- per member per day. That is a deliberate narrowing (a member RSVPing to two events on one day is
-- paid for the first) and it is the only cap shape award_gems_atomic can enforce without a schema
-- change; the reward is a nudge to commit, not wages, so paying once a day is the honest reading.
-- lib/gems.test.ts pins the value against THIS file and proves the second award in a UTC day is
-- refused.
--
-- ACL. `create or replace` preserves the existing ACL, so the 20260926000000 lockdown (revoke from
-- public, anon, authenticated) still stands after the replace. Restated below, role-explicit
-- (ADR-959), so this file carries its own verdict. Both statements are no-ops on the live catalog.
--
-- House style: additive + idempotent (create or replace, update by key); SECURITY DEFINER with a
-- pinned search_path. No em or en dashes. Ledger: apply through MCP, then repair the ledger row to
-- THIS version (supabase/migrations/README.md, the two-step protocol).
--
-- ROLLBACK: re-run the `create or replace function public.enforce_event_rsvp_capacity()` block of
-- 20270336000000_capacity_trigger_seats_approval_not_requests.sql (the unlocked read comes back,
-- and with it the race; there is no reason to want that), and
-- `update public.gem_config set daily_cap = null where action_type = 'event_rsvp';`.
-- The function is never dropped here and the trigger is never re-attached.

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
    -- Lock the event row so concurrent RSVPs serialise on it (race-safe count). Without this,
    -- two inserts in the same instant each count the other's uncommitted row as absent and both
    -- keep the last seat. Same idiom as enforce_circle_member_cap (20260726000000).
    select capacity into cap from public.events where id = NEW.event_id for update;
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

-- The 20260926000000 lockdown, restated so this file carries its own verdict (ADR-959). Trigger
-- functions are invoked by the trigger, never by a client, so nobody but the owner needs execute.
revoke execute on function public.enforce_event_rsvp_capacity() from public, anon, authenticated;

-- L6-06: one event_rsvp gem award per member per UTC day (award_gems_atomic, 20260929000000).
update public.gem_config
   set daily_cap = 1
 where action_type = 'event_rsvp';

-- PROVE THE BEHAVIOUR, not the text. The race itself needs two sessions and cannot be staged in a
-- single DO block, so this control proves the two things a single session CAN prove:
--   1. the replaced body still coerces the seat after the last one (the behaviour 20270336000000
--      pinned did not regress while the lock was added), and
--   2. the cap row reads 1.
-- A `pg_get_functiondef` grep for 'for update' would pass on a body that locks the wrong table;
-- the two-session script beside scan row L6-01 is the consequence probe for the lock itself.
do $$
declare
  v_ev   uuid := gen_random_uuid();
  v_a    uuid;
  v_b    uuid;
  v_stat text;
  v_cap  int;
  v_def  text;
begin
  insert into public.events (id, title, slug, scope_id, scope_type, starts_at, capacity)
  values (v_ev, 'capacity lock probe', 'capacity-lock-probe-' || replace(v_ev::text, '-', ''),
          gen_random_uuid(), 'public', now() + interval '30 days', 1);

  insert into public.event_rsvps (event_id, guest_email, guest_name, status)
  values (v_ev, 'a@probe.invalid', 'A', 'going') returning id into v_a;
  insert into public.event_rsvps (event_id, guest_email, guest_name, status)
  values (v_ev, 'b@probe.invalid', 'B', 'going') returning id into v_b;

  select status into v_stat from public.event_rsvps where id = v_a;
  if v_stat is distinct from 'going' then
    raise exception 'the first RSVP on a one-seat event landed as %, expected going', v_stat;
  end if;
  select status into v_stat from public.event_rsvps where id = v_b;
  if v_stat is distinct from 'waitlist' then
    raise exception 'the second RSVP on a one-seat event landed as %, expected waitlist - the capacity coercion regressed', v_stat;
  end if;

  -- The lock reads the events table. A body that locked event_rsvps instead would still pass the
  -- two checks above, so the one textual check here is narrowed to the exact clause.
  select pg_get_functiondef('public.enforce_event_rsvp_capacity()'::regprocedure) into v_def;
  if v_def !~* 'from\s+public\.events\s+where\s+id\s*=\s*NEW\.event_id\s+for\s+update' then
    raise exception 'enforce_event_rsvp_capacity does not lock the events row (no FOR UPDATE on the capacity read)';
  end if;

  select daily_cap into v_cap from public.gem_config where action_type = 'event_rsvp';
  if v_cap is distinct from 1 then
    raise exception 'gem_config.event_rsvp daily_cap is %, expected 1', v_cap;
  end if;

  delete from public.event_rsvps where event_id = v_ev;
  delete from public.events where id = v_ev;
end $$;

commit;
