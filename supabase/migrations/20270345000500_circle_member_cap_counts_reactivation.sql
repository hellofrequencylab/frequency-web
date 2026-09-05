-- =============================================================================
-- 20270345000500  circle member cap + member_count agree on reactivation (scan2 L6-13, 2026-09-05)
--
-- THE DEFECT. Two numbers described one circle and disagreed:
--   * enforce_circle_member_cap (20260726000000) fired BEFORE INSERT only and counted ACTIVE rows.
--     A dormant row (status pending / inactive) flipped to active by UPDATE walked straight past it,
--     so the reactivation path (settleExistingMembership, app/(main)/circles/actions.ts) was a JS
--     count-then-update with no database guard: two dormant members reactivating together could
--     exceed the cap.
--   * circles.member_count (20240102000000) was +1 on ANY insert and -1 on DELETE only, so it
--     counted dormant rows and never followed a status change. The join pre-check reads it, which
--     is exactly why it waved a reactivation through that the cap then had no chance to refuse.
--
-- THE FIX, in three parts, all additive and idempotent:
--   1. enforce_circle_member_cap also fires on UPDATE OF status. Only a transition INTO 'active'
--      consumes a seat; it locks the circle row FOR UPDATE (the sibling event RSVP guard's posture)
--      so concurrent joins and reactivations serialize, counts ACTIVE rows, and raises circle_full
--      (P0001) exactly as the insert path does. The JS maps that raise to "This circle is full."
--   2. member_count follows status transitions through ONE new trigger function,
--      trg_sync_circle_member_count: +1 when a row becomes active (insert as active, or update
--      non-active to active), -1 when it stops being active (delete an active row, or update active
--      to non-active). The two old insert/delete triggers are dropped; their functions are left in
--      place (never deleted, they are in the function-grants ledger) but no longer wired.
--   3. A one-time resync sets member_count to the true active count wherever the two drifted.
--
-- Rollback note at the bottom. No em or en dashes in this file.
-- =============================================================================

-- ── 1. The cap guard: INSERT and UPDATE OF status ───────────────────────────────────────────────
create or replace function public.enforce_circle_member_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap    integer;
  v_active integer;
begin
  -- Only a row that is BECOMING active consumes a seat. An update that leaves an already-active
  -- row active (or touches a non-active row without activating it) is not a join.
  if NEW.status is distinct from 'active' then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.status is not distinct from 'active' then
    return NEW;
  end if;

  -- Lock the circle row so concurrent joins and reactivations serialize on it (race-safe count).
  select member_cap into v_cap
    from public.circles
   where id = NEW.circle_id
   for update;

  -- No circle / no cap configured: nothing to enforce.
  if v_cap is null then
    return NEW;
  end if;

  select count(*) into v_active
    from public.memberships
   where circle_id = NEW.circle_id
     and status = 'active'
     and id <> NEW.id;

  if v_active >= v_cap then
    raise exception 'circle_full' using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_circle_member_cap on public.memberships;
create trigger trg_enforce_circle_member_cap
  before insert or update of status on public.memberships
  for each row execute function public.enforce_circle_member_cap();

-- ── 2. member_count follows status transitions ──────────────────────────────────────────────────
create or replace function public.trg_sync_circle_member_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was boolean := (TG_OP <> 'INSERT' and OLD.status = 'active');
  v_is  boolean := (TG_OP <> 'DELETE' and NEW.status = 'active');
begin
  if v_is and not v_was then
    update public.circles set member_count = member_count + 1 where id = NEW.circle_id;
  elsif v_was and not v_is then
    update public.circles set member_count = greatest(member_count - 1, 0) where id = OLD.circle_id;
  end if;
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

-- The old insert/delete pair counted every row regardless of status. Unwire both; the functions
-- stay (ledger entries, never deleted).
drop trigger if exists trg_memberships_insert on public.memberships;
drop trigger if exists trg_memberships_delete on public.memberships;
drop trigger if exists trg_memberships_member_count on public.memberships;
create trigger trg_memberships_member_count
  after insert or update of status or delete on public.memberships
  for each row execute function public.trg_sync_circle_member_count();

-- ── 3. One-time resync of any drift the old pair left behind ────────────────────────────────────
update public.circles c
   set member_count = live.n
  from (
    select c2.id, count(m.id)::integer as n
      from public.circles c2
      left join public.memberships m on m.circle_id = c2.id and m.status = 'active'
     group by c2.id
  ) live
 where live.id = c.id
   and c.member_count is distinct from live.n;

-- ── Grants: both are trigger functions, service-side only ───────────────────────────────────────
revoke execute on function public.enforce_circle_member_cap()     from public, anon, authenticated;
revoke execute on function public.trg_sync_circle_member_count()  from public, anon, authenticated;
grant  execute on function public.trg_sync_circle_member_count()  to service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────────────────────────
--   drop trigger if exists trg_memberships_member_count on public.memberships;
--   create trigger trg_memberships_insert after insert on public.memberships
--     for each row execute function public.trg_increment_circle_member_count();
--   create trigger trg_memberships_delete after delete on public.memberships
--     for each row execute function public.trg_decrement_circle_member_count();
--   drop function if exists public.trg_sync_circle_member_count();
--   drop trigger if exists trg_enforce_circle_member_cap on public.memberships;
--   create trigger trg_enforce_circle_member_cap before insert on public.memberships
--     for each row execute function public.enforce_circle_member_cap();
--   (the function body from 20260726000000 can be re-applied to drop the UPDATE branch; the
--    branch is inert under a BEFORE INSERT trigger, so leaving it is also safe)
