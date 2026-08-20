-- ============================================================================
-- CIRCLE ACCESS: `space_members` keeps the STAFF ladder, and paying members get
-- their OWN mode, `space_paid_members` (OWN-034 ruling C · ADR-1092).
--
-- ── THE RULING ───────────────────────────────────────────────────────────────────────────────
--
-- OWN-034 asked the owner to rule on `access = 'space_members'`: relabel it (A), widen the
-- predicate (B), or add a mode (C). The owner ruled **C: add a paid mode** — `space_members`
-- keeps its staff semantics and stops PROMISING paying members in its copy, and a new, separate
-- mode `space_paid_members` admits the Space's active paid members.
--
-- ── WHAT IS LIVE TODAY, MEASURED (2026-08-20, azsqfeonabsbmemvddqd) ──────────────────────────
--
-- ⚠️ The OWN-034 row's premise had EXPIRED by the time it was worked (the ADR-1082 pattern).
-- The row said the mode reads the staff ladder at both layers. It did on 2026-08-12 — but
-- ADR-1021 (`20270229000000_circle_space_audience.sql`, applied) had since pointed the
-- `space_members` arm of `private.can_enter_circle` at `private.is_space_audience`, which is
-- staff OR an active `space_memberships` row. So option B's substance was already live when the
-- owner ruled C. This migration therefore does two things, not one:
--
--   1. It RETURNS the `space_members` arm to `private.is_space_member` (the staff ladder), which
--      is the semantics ruling C keeps.
--   2. It adds `space_paid_members`, whose arm is the NEW `private.is_space_paid_member` — an
--      active `space_memberships` row, exactly the audience half ADR-1021 had folded into the
--      old mode.
--
-- 🔴 Step 1 NARROWS a live authorization predicate: an active paying member could enter a
-- `space_members` Circle yesterday and cannot tomorrow. Measured impact is NIL — production
-- holds 7 Circles and every one is `access = 'open'` (0 closed circles, re-measured 2026-08-20),
-- so no live viewer loses anything they can reach today. The paying audience does not lose the
-- capability either; it moves to the mode that names them honestly.
--
-- `private.is_space_audience` (the staff-OR-paid union) is DROPPED: after this file no arm
-- anywhere asks the union question, and a lingering staff-or-paid predicate is exactly the kind
-- of thing a future policy reaches for by accident. Its two halves live on as the two per-mode
-- predicates.
--
-- ── WHAT "ACTIVE PAID MEMBER" MEANS, CONCRETELY ──────────────────────────────────────────────
--
-- An ACTIVE `space_memberships` row (`status = 'active'`; the other legal values are 'waitlist'
-- and 'cancelled'). `tier_id` is NOT NULL on that table, so every membership rides a tier the
-- operator created. `payment_status` is DELIBERATELY not consulted, matching how ADR-1021's
-- audience arm read the table: `status` is the operator-facing lifecycle the app writes, and the
-- 2 live memberships are `status='active', payment_status='pending'` — keying on payment_status
-- would shut out every live member the day the mode ships. If billing wants lapsed members out
-- of the room, it flips `status`, and this predicate follows.
--
-- ── WHY THE CRM WALL STILL STANDS (unchanged from ADR-1021) ──────────────────────────────────
--
-- `private.is_space_member` is used by SIXTEEN RLS policies to gate the CRM pipeline, client
-- notes, orders and disputes. It never learns about `space_memberships` — a paying member
-- belongs in a Circle, not in the operator's pipeline. The mirror also holds:
-- `is_space_paid_member` never reads the staff ladder, so "has a seat" and "holds a membership"
-- stay two different facts. Both directions are pinned in
-- supabase/tests/circle_space_paid_members.test.sql.
--
-- House style: additive + idempotent where possible, `create or replace`, constraint
-- dropped-then-recreated, helpers in `private`. SAFE to re-run.
--
-- ⚠️ NOT APPLIED BY THIS AGENT. Apply via execute_sql + an explicit ledger insert for version
-- 20270319000000 (supabase/migrations/README.md), never apply_migration.
--
-- ROLLBACK (manual; this migration is never auto-reverted):
--   restore private.can_enter_circle and private.is_space_audience from
--     20270229000000_circle_space_audience.sql;
--   restore public.enforce_circle_access_shape from 20270227000000_circle_privacy.sql;
--   drop function if exists private.is_space_paid_member(uuid);
--   alter table public.circles drop constraint if exists circles_access_check;
--   alter table public.circles add constraint circles_access_check
--     check (access in ('open','circle_members','space_members','invite','tier'));
--   (only valid while no circle row carries 'space_paid_members')
-- ============================================================================

-- ── 1. The axis gains its sixth value ─────────────────────────────────────────────────────────
-- `circles.access` is TEXT + CHECK (not an enum), so widening is drop-and-recreate of the one
-- row-local constraint, same idiom as 20270227000000.

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.circles'::regclass and contype = 'c'
      and conname = 'circles_access_check'
  loop
    execute format('alter table public.circles drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.circles
  add constraint circles_access_check
  check (access in ('open', 'circle_members', 'space_members', 'space_paid_members', 'invite', 'tier'));

comment on column public.circles.access is
  'WHO MAY ENTER this Circle and see its content (ADR-1015, ADR-1092). The SECOND axis; `unlisted` is the first (discoverability), and the two are INDEPENDENT -- a LISTED circle with a closed access mode is the lead funnel the owner named: found in the index by name, shut on the inside. Values: open (self-serve, today''s behaviour) · circle_members (only active members; the Host adds you) · space_members (the owning Space''s STAFF ladder -- owner or an active space_members seat -- may enter and self-join; OWN-034 ruling C) · space_paid_members (an ACTIVE space_memberships holder may enter and self-join) · invite (an invite link or QR only) · tier (a linked space_membership_tiers row, ADR-859). Set by the Space owner in their membership settings. Enforced by circles_access_restrictive + private.can_enter_circle, NOT by the UI.';

-- ── 2. The paid-mode predicate ────────────────────────────────────────────────────────────────
-- The audience half of ADR-1021's union, now standing alone under the mode that names it.
-- 🔴 It NEVER reads `space_members`: a seat on the team is not a membership, and the two facts
-- staying separate is what lets ruling C mean anything. Pinned in pgTAP.

create or replace function private.is_space_paid_member(p_space_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select exists (
    select 1
    from public.space_memberships sm
    where sm.space_id = p_space_id
      and sm.member_profile_id = private.get_my_profile_id()
      and sm.status = 'active'
  );
$$;

-- ⚠️ BOTH REVOKE HALVES, IN ONE STATEMENT (ADR-959). Supabase ships `ALTER DEFAULT PRIVILEGES IN
-- SCHEMA public`, so anon and authenticated hold EXPLICIT per-role grants the moment an object
-- exists, and `revoke ... from public` does not touch an explicit per-role grant. Naming all
-- three is the only form that actually closes it. anon and authenticated then get execute back
-- DELIBERATELY: an RLS policy evaluates as the INVOKING role, and this predicate sits under
-- `circles_access_restrictive` via can_see_circle → can_enter_circle. Identical posture to
-- private.is_space_member and the ADR-1015 helpers.
revoke all on function private.is_space_paid_member(uuid) from public, anon, authenticated;
grant execute on function private.is_space_paid_member(uuid)
  to anon, authenticated, service_role;

comment on function private.is_space_paid_member(uuid) is
  'Does the CURRENT caller hold an ACTIVE space_memberships row in this Space (OWN-034 ruling C, ADR-1092)? The arm behind the space_paid_members Circle access mode. Deliberately reads ONLY space_memberships: the staff ladder (space_members, via is_space_member) answers the space_members mode, and the two facts never merge -- that separation IS the ruling. payment_status is not consulted; status is the lifecycle the app writes.';

-- ── 3. The arm flip: space_members back to staff, space_paid_members added ────────────────────
-- Byte-identical to 20270229000000 apart from the two Space arms. Restated in full because
-- CREATE OR REPLACE needs the whole body, and the unchanged arms are re-asserted so a future
-- reader can diff the three files directly.
create or replace function private.can_enter_circle(
  p_circle_id uuid,
  p_access text,
  p_space_id uuid,
  p_host_id uuid
)
returns boolean
language sql
stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select
    -- An open Circle is open. Anyone signed in may walk in, exactly as today.
    coalesce(p_access, 'open') = 'open'
    -- An active member of the Circle. This is how `tier`, `invite` and `circle_members` all
    -- resolve once someone is actually in: the tier purchase and the invite redemption both
    -- WRITE a memberships row (ADR-859, joinViaInviteLink), so entry is never a live re-check
    -- against Stripe -- it is a durable row, and this arm reads it.
    or p_circle_id = any(coalesce(private.get_my_circle_ids(), '{}'::uuid[]))
    -- The Host who runs it.
    or (p_host_id is not null and p_host_id = private.get_my_profile_id())
    -- 🔴 RULING C, HALF ONE (OWN-034, ADR-1092). Back to the STAFF ladder -- the Space's owner or
    -- an active space_members seat. ADR-1021 had this arm asking the staff-OR-paid audience
    -- question; the owner ruled the two audiences get two modes. Still only for this mode --
    -- a Space seat is NOT a general key to a Space's Circles.
    or (coalesce(p_access, 'open') = 'space_members' and private.is_space_member(p_space_id))
    -- 🔴 RULING C, HALF TWO. The paying audience, under the mode that names it: an ACTIVE
    -- space_memberships holder. Same scoping rule -- a membership opens ONLY this mode.
    or (coalesce(p_access, 'open') = 'space_paid_members' and private.is_space_paid_member(p_space_id))
    -- A steward of the owning Space: owner, or an active editor/moderator/admin. Reuses the write
    -- predicate on purpose -- someone who can move or delete the Circle can read it. For a
    -- PERSONAL circle this resolves to the root-space arm, i.e. platform staff only, which is the
    -- correct answer and the reason this policy exists at all. NOTE this arm is what still admits
    -- editor+ staff to a space_paid_members Circle: stewards get every Circle (ADR-1015 §5), so
    -- the paid mode's own arm never needs to know about seats.
    or private.can_write_space_content(p_space_id)
    -- Break-glass for platform staff (moderation, support). NOT community_role: a `guide` rank
    -- moderates the community, it is not a key to somebody's private room.
    or private.get_my_web_role() in ('admin', 'janitor');
$$;

-- ── 4. The union predicate retires ────────────────────────────────────────────────────────────
-- No arm asks staff-OR-paid any more, and an idle union predicate over an authorization boundary
-- is a foot-gun waiting for a future policy to pick it up. Its halves live on as
-- is_space_member (staff) and is_space_paid_member (paid).
drop function if exists private.is_space_audience(uuid);

-- ── 5. The shape trigger learns the sixth value ───────────────────────────────────────────────
-- `space_paid_members` draws on a Space's membership roster, so like `space_members` and `tier`
-- it is nonsense on a PERSONAL Circle (the root sentinel has no memberships and sells nothing).
-- NO plan floor: a free Space may run free membership tiers (enforce_membership_tier_circle_link
-- allows a free tier anywhere), and an operator who drops off a paid plan keeps their members --
-- the floor belongs to SELLING (`tier`), not to having members. Same body as 20270227000000
-- otherwise.
create or replace function public.enforce_circle_access_shape()
returns trigger
language plpgsql
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_is_real_space boolean;
begin
  if new.access in ('space_members', 'space_paid_members', 'tier') then
    select exists (
      select 1 from public.spaces s where s.id = new.space_id and s.type <> 'root'
    ) into v_is_real_space;

    if not v_is_real_space then
      raise exception 'circle_access_needs_space'
        using errcode = 'P0001',
              hint = 'A personal Circle lives on the root Space, which has no membership roster and sells nothing. Only a Circle a Space owns can use space_members, space_paid_members or tier access.';
    end if;

    if new.access = 'tier' and not private.space_can_sell(new.space_id) then
      raise exception 'circle_access_plan_floor'
        using errcode = 'P0001',
              hint = 'Selling access to a Circle comes with the Business plan.';
    end if;
  end if;

  return new;
end;
$$;

-- The trigger itself already points at this function (20270227000000); replacing the body is the
-- whole change. Recreated defensively so a fresh replay is complete either way.
drop trigger if exists trg_circles_access_shape on public.circles;
create trigger trg_circles_access_shape
  before insert or update on public.circles
  for each row execute function public.enforce_circle_access_shape();
