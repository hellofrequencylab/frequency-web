-- space_enrollments gets a DB-side capacity guard (SCAN-708).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- THE DEFECT. A capped program could be overbooked. enrollInProgram (lib/spaces/enroll.ts) counted
-- the active enrollments on a Space in JavaScript, compared the count to space_programs.capacity,
-- and then inserted. Nothing on the table itself enforced the cap: the only database guard on
-- space_enrollments is the partial unique index space_enrollments_one_active_per_member
-- (20260716000100), which stops one member enrolling twice and says nothing about seat count. Two
-- members clicking Enroll on the last seat both passed the JS count (each read capacity - 1 active
-- rows) and both inserts landed, so a cohort capped at 12 held 13. This is exactly the race the
-- ticket tier path closed with enforce_space_ticket_tier_capacity (20270345000200), and the event
-- and Circle paths before it. space_enrollments was the one seat table left without one.
--
-- THE FIX, modelled on the tier guard. A BEFORE INSERT OR UPDATE OF status trigger that:
--   1. only acts when the row is BECOMING active (an insert with status active, or an update that
--      moves a non-active row to active); a cancel, or an edit that leaves an active row active,
--      is free;
--   2. locks the PROGRAM row (select ... for update) so two concurrent enrolls on one program
--      serialise on that lock and the second one counts the first one's row;
--   3. counts the active rows for the Space, excluding NEW.id so an update never counts itself;
--   4. raises 'program_full' with sqlstate 23514 (check_violation) when the count already meets
--      the capacity. A capacity of 0 means no cap (the column's own contract) and is never
--      enforced.
--
-- The count is per SPACE, as the JS count is (countActiveEnrollments reads the Space's active
-- rows): v1 holds one program per Space (space_programs_one_per_space), so the two are the same
-- set, and the Space is the tenant every read of this table filters first.
--
-- THE JS PRE-CHECK STAYS. It is the fast path that answers a full program without a write attempt;
-- this trigger is the guard that holds when two of those fast paths race. enrollInProgram maps the
-- raise onto its existing "This program is full right now." message, keeps "You are already
-- enrolled here." for the unique index (sqlstate 23505), and says "Could not enroll right now.
-- Try again." for anything else, where before every insert error read as already enrolled.
--
-- ACL. A trigger function is fired by the trigger, never called over PostgREST, but Supabase's
-- default privileges still hand anon and authenticated EXECUTE on every new public function.
-- Revoked role-explicit below (ADR-959). Verdict for scripts/function-grants.txt: internal.
--
-- House style: additive + idempotent (create or replace, drop trigger if exists). No em or en
-- dashes. Ledger: apply through MCP, then repair the ledger row to THIS version
-- (supabase/migrations/README.md, the two-step protocol).

begin;

create or replace function public.enforce_space_program_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cap    integer;
  v_active integer;
begin
  -- Only a row that is BECOMING active takes a seat. A cancel, or an update that leaves an active
  -- row active, never re-counts.
  if NEW.status is distinct from 'active' then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.status = 'active' then
    return NEW;
  end if;

  -- Lock the program row so concurrent enrolls on one program serialise here. The second
  -- transaction blocks on this select until the first commits, then counts the first's row below.
  select p.capacity
    into v_cap
    from public.space_programs p
   where p.id = NEW.program_id
     for update;

  -- No program row (the FK will reject the insert anyway) or no cap (0): nothing to hold.
  if v_cap is null or v_cap <= 0 then
    return NEW;
  end if;

  select count(*)
    into v_active
    from public.space_enrollments e
   where e.space_id = NEW.space_id
     and e.status = 'active'
     and e.id <> NEW.id;

  if v_active >= v_cap then
    raise exception 'program_full' using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

comment on function public.enforce_space_program_capacity() is
  'BEFORE INSERT OR UPDATE OF status guard on space_enrollments: locks the program row, counts the Space''s active enrollments (excluding the row itself) and raises program_full (sqlstate 23514) when the program is at capacity. capacity 0 = no cap. enrollInProgram in lib/spaces/enroll.ts maps program_full onto its "This program is full right now." message. Trigger function, never called directly; service-role only.';

drop trigger if exists trg_enforce_space_program_capacity on public.space_enrollments;
create trigger trg_enforce_space_program_capacity
  before insert or update of status on public.space_enrollments
  for each row execute function public.enforce_space_program_capacity();

-- Trigger function: fired by the trigger, never an RPC. Role-explicit revoke (ADR-959).
revoke execute on function public.enforce_space_program_capacity() from public, anon, authenticated;

commit;

-- Rollback: drop trigger if exists trg_enforce_space_program_capacity on public.space_enrollments;
-- drop function if exists public.enforce_space_program_capacity();
-- The table and its partial unique index are untouched by this file; the program simply goes back
-- to being guarded by the JS count alone.
