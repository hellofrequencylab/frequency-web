-- ── AUTO-ENROL A SPACE'S MEMBERS INTO ITS SPACE CIRCLE (ADR-1395) ────────────────────────────────
--
-- [ADR-1393](docs/DECISIONS.md) left one question open by name: "Whether a Space Circle should
-- auto-enrol new Space members is still for the owner to name." Owner, 2026-09-17: *"Auto enroll
-- space members into the main circle."*
--
-- ── WHICH "MEMBERS" (the two-table trap, and it is the whole correctness question) ───────────────
--
-- 🔴 THREE TABLES CARRY NEAR-IDENTICAL NAMES AND THEY ARE NOT THE SAME PEOPLE. lib/circles/space-entry.ts
-- and docs/NAMING.md both warn about the first two in block comments, because the product shipped a
-- bug from exactly this confusion once already (ADR-1021's copy promised the payers while the mode
-- admitted the staff):
--
--   space_memberships   the Space's MEMBERS: people who joined/bought a membership. Keyed on
--                       `member_profile_id`, NOT `profile_id`. ← THIS IS THE SET THIS FEATURE USES.
--   space_members       the STAFF ladder (viewer < editor < moderator < admin): the people who RUN
--                       the Space. Not members in the operator's language.
--   space_follows       FOLLOWERS, keyed on `follower_profile_id`. A follow is a low-commitment act.
--
-- `space_memberships` is the set the owner's word means: docs/NAMING.md defines the
-- `space_paid_members` door as "the Space's members in the operator's own language, the people who
-- bought a membership". Staff and followers are deliberately NOT enrolled:
--   • STAFF already reach the hub. The Space's owner is its Circle's `host_id` from
--     `ensure_space_circle`, and whoever may edit the Space already runs its Circle (ADR-1391 §6).
--   • A FOLLOWER has opted into updates, not into a room. Auto-joining someone to a group feed
--     because they tapped Follow is the kind of enrolment that reads as spam, and the door is
--     `open` since ADR-1393, so a follower joins in one click whenever they want to.
-- Either could be added later by widening ONE select in `sync_space_circle_roster` below.
--
-- ── 🔴 THE OPT-OUT, WHICHOUT WHICH THIS FEATURE SILENTLY BREAKS "LEAVE" ─────────────────────────
--
-- `leaveCircle` (app/(main)/circles/actions.ts) DELETES the membership row. It leaves no trace. So
-- an enrolment sweep with no memory would re-add every member who had ever left, and the Leave
-- control that ADR-1394 just moved to the Circle's tab row would become a button that does nothing
-- until the next sweep. A member who cannot leave a room they were put in without asking is the
-- worst outcome this change could have, so the opt-out is not a refinement of the feature, it is
-- the feature's precondition.
--
-- `space_circle_optouts` is that memory, and the trigger that maintains it lives on `memberships`
-- rather than in the app for the reason ADR-1391 put `ensure_space_circle` on a trigger: so no
-- call site has to remember. Any path that removes somebody from a Space Circle records the
-- decline, including paths nobody has written yet.
--
-- A HOST REMOVING SOMEBODY records an opt-out too, and that is deliberate rather than incidental:
-- without it the next sweep would re-add the person the host just removed, so removal would be as
-- broken as leaving.
--
-- ── NO REVOKE: ENROLMENT IS ONE-WAY ─────────────────────────────────────────────────────────────
--
-- A lapsed or cancelled membership does NOT evict anybody from the Circle. This is a decision, not
-- an omission, and it is why this migration needs no provenance column of its own (contrast
-- `memberships.granted_by_tier_id`, ADR-859, which exists precisely so a revoke can delete its own
-- rows and nothing else):
--   • The door is `open` (ADR-1393). Evicting somebody from a room they can rejoin in one click
--     achieves nothing but the insult.
--   • ADR-1391 already ruled that turning a Space Circle OFF keeps its members. Dropping them on a
--     billing event would contradict the gentler rule already in force.
-- An operator who wants a members-only room switches the door to `space_paid_members`; that governs
-- who may JOIN, and an existing member stays a member, exactly as on every other Circle.
--
-- ROLLBACK:
--   drop trigger if exists space_memberships_enrol_space_circle on public.space_memberships;
--   drop trigger if exists memberships_space_circle_optout on public.memberships;
--   drop function if exists public.sync_space_circle_roster(uuid);
--   drop function if exists public.enrol_in_space_circle(uuid, uuid);
--   drop function if exists public.space_memberships_enrol_space_circle();
--   drop function if exists public.memberships_space_circle_optout();
--   drop table if exists public.space_circle_optouts;
--   (Enrolled rows are ordinary memberships and may be left in place; they are indistinguishable
--    from a self-join by design, which is the point of having no provenance column.)

-- ── 1) The decline memory ────────────────────────────────────────────────────────────────────────
create table if not exists public.space_circle_optouts (
  space_id   uuid not null references public.spaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  left_at    timestamptz not null default now(),
  primary key (space_id, profile_id)
);

comment on table public.space_circle_optouts is
  'A row means: this profile has left (or been removed from) this Space''s Space Circle, so auto-enrolment must not put them back (ADR-1395). Maintained ENTIRELY by the memberships trigger below, never by hand: a delete records the row, a fresh insert clears it. It does not gate a deliberate join, because a manual join creates the membership row that clears the decline.';

-- ── 2) The trigger that keeps the memory true ────────────────────────────────────────────────────
create or replace function public.memberships_space_circle_optout()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_space_id uuid;
  v_circle_id uuid;
  v_profile_id uuid;
begin
  -- One body for both directions; TG_OP picks the row that exists.
  if tg_op = 'DELETE' then
    v_circle_id := old.circle_id;
    v_profile_id := old.profile_id;
  else
    v_circle_id := new.circle_id;
    v_profile_id := new.profile_id;
  end if;

  -- Space Circles only. An ordinary Circle has no auto-enrolment to defend against, so recording
  -- declines for one would collect rows nothing ever reads.
  select c.space_id into v_space_id
    from public.circles c
   where c.id = v_circle_id
     and c.is_space_primary;

  if v_space_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    insert into public.space_circle_optouts (space_id, profile_id)
    values (v_space_id, v_profile_id)
    on conflict (space_id, profile_id) do nothing;
    return old;
  end if;

  -- An INSERT is somebody arriving: either they joined deliberately or a sweep enrolled them
  -- (which only happens when no decline exists). Either way the decline is stale.
  delete from public.space_circle_optouts
   where space_id = v_space_id and profile_id = v_profile_id;
  return new;
end
$$;

revoke execute on function public.memberships_space_circle_optout() from public, anon, authenticated;

drop trigger if exists memberships_space_circle_optout on public.memberships;
create trigger memberships_space_circle_optout
  after insert or delete on public.memberships
  for each row execute function public.memberships_space_circle_optout();

-- ── 3) Enrol one member ─────────────────────────────────────────────────────────────────────────
create or replace function public.enrol_in_space_circle(p_space_id uuid, p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_circle_id uuid;
begin
  if p_space_id is null or p_profile_id is null then
    return false;
  end if;

  -- The Space's own Circle. At most one exists (a unique partial index enforces it, ADR-1391).
  -- An `archived` Circle is skipped: its Space was wound down. An `inactive` one is NOT skipped,
  -- deliberately: ADR-1391 keeps members on a Circle its Space has turned off, so a Space that
  -- switches its hub on later finds a populated room instead of an empty one.
  select c.id into v_circle_id
    from public.circles c
   where c.space_id = p_space_id
     and c.is_space_primary
     and c.status <> 'archived';

  if v_circle_id is null then
    return false;
  end if;

  -- They said no once. Never ask twice.
  if exists (
    select 1 from public.space_circle_optouts o
     where o.space_id = p_space_id and o.profile_id = p_profile_id
  ) then
    return false;
  end if;

  -- Already on the roster in ANY state (active, pending, inactive): an enrolment must never
  -- overwrite a status somebody or something else chose.
  if exists (
    select 1 from public.memberships m
     where m.circle_id = v_circle_id and m.profile_id = p_profile_id
  ) then
    return false;
  end if;

  -- 🔴 A FULL CIRCLE MUST NOT FAIL THE CALLER. This runs inside the transaction that is creating a
  -- paid Space membership, and `enforce_circle_member_cap` raises `circle_full` (P0001) at 300.
  -- Letting that propagate would roll back somebody's purchase because a room was full, which is
  -- the same rule ADR-859's tier engine states for its own inserts. A unique violation is the
  -- benign race (two sweeps at once) and is swallowed for the same reason.
  begin
    insert into public.memberships (profile_id, circle_id, status)
    values (p_profile_id, v_circle_id, 'active');
    return true;
  exception
    when others then
      if sqlerrm = 'circle_full' or sqlstate = '23505' then
        return false;
      end if;
      raise;
  end;
end
$$;

comment on function public.enrol_in_space_circle(uuid, uuid) is
  'Put one Space member on their Space Circle''s roster (ADR-1395). Idempotent, honours space_circle_optouts, and swallows a full circle rather than failing the membership that triggered it. Returns true only when a row was created.';

revoke execute on function public.enrol_in_space_circle(uuid, uuid) from public, anon, authenticated;

-- ── 4) Enrol on the membership becoming active ──────────────────────────────────────────────────
create or replace function public.space_memberships_enrol_space_circle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Only the transition INTO active. `space_memberships.status` is text carrying 'active' and
  -- 'cancelled' today; anything that is not active grants nothing, and re-firing on an unrelated
  -- column update would be wasted work (the enrol function is idempotent, so it would be harmless,
  -- just pointless).
  if new.status is distinct from 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  -- ⚠️ `member_profile_id`, not `profile_id`. The database refused ADR-1021's first migration for
  -- exactly this mix-up, and the comment in lib/circles/space-entry.ts says it is worth a comment
  -- forever.
  perform public.enrol_in_space_circle(new.space_id, new.member_profile_id);
  return new;
end
$$;

revoke execute on function public.space_memberships_enrol_space_circle() from public, anon, authenticated;

drop trigger if exists space_memberships_enrol_space_circle on public.space_memberships;
create trigger space_memberships_enrol_space_circle
  after insert or update of status on public.space_memberships
  for each row execute function public.space_memberships_enrol_space_circle();

-- ── 5) Sweep one Space ──────────────────────────────────────────────────────────────────────────
-- The catch-up path: used by the backfill below and by the app when an operator switches their
-- Space Circle ON, so turning the hub on enrols everyone who joined while it was off.
create or replace function public.sync_space_circle_roster(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_added integer := 0;
  r record;
begin
  for r in
    select distinct sm.member_profile_id as profile_id
      from public.space_memberships sm
     where sm.space_id = p_space_id
       and sm.status = 'active'
       and sm.member_profile_id is not null
  loop
    if public.enrol_in_space_circle(p_space_id, r.profile_id) then
      v_added := v_added + 1;
    end if;
  end loop;
  return v_added;
end
$$;

comment on function public.sync_space_circle_roster(uuid) is
  'Enrol every ACTIVE member of a Space into its Space Circle, skipping anyone who opted out or is already on the roster (ADR-1395). Returns how many rows it created. Safe to re-run; called by the backfill and when an operator switches the Space Circle on.';

revoke execute on function public.sync_space_circle_roster(uuid) from public, anon, authenticated;

-- ── 6) Backfill ─────────────────────────────────────────────────────────────────────────────────
-- Every Space that has a Space Circle gets its current active members enrolled. Tiny today (one
-- active space membership on the whole platform, measured 2026-09-17), and correct whatever the
-- number becomes.
do $$
declare s record;
begin
  for s in
    select distinct c.space_id
      from public.circles c
     where c.is_space_primary
       and c.status <> 'archived'
       and c.space_id is not null
  loop
    perform public.sync_space_circle_roster(s.space_id);
  end loop;
end $$;

-- ── 7) RLS ──────────────────────────────────────────────────────────────────────────────────────
-- A member may read their OWN declines (so a surface could one day say "you left this hub"); the
-- table is written only by the trigger above, which runs security definer on the service role. No
-- insert/update/delete policy exists on purpose: a caller-role write here would let somebody forge
-- somebody else's decline and quietly keep them out of their own Space's hub.
alter table public.space_circle_optouts enable row level security;

drop policy if exists "space_circle_optouts read own" on public.space_circle_optouts;
create policy "space_circle_optouts read own"
  on public.space_circle_optouts
  for select
  using (
    profile_id in (
      select p.id from public.profiles p where p.auth_user_id = auth.uid()
    )
  );

revoke insert, update, delete on public.space_circle_optouts from anon, authenticated;
