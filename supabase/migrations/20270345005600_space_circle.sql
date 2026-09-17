-- THE SPACE CIRCLE (ADR-1391). Every Space has one primary Circle, hosted by the Space itself.
--
-- WHY. Owner, 2026-09-16: "Each space should have a primary circle that has extended capabilities. Right
-- now Meghan Riley is the host of Royal Temple circle. She's the owner of the space but it should be
-- Hosted by Royal Temple. The Circle can be turned off if a space doesn't want it but it's always
-- attached. This space circle should have a 300 member cap." Owner rulings the same day: existing Spaces
-- get theirs turned OFF, new Spaces get theirs ON; the host line reads only the Space; joining defaults
-- to Space members only (`space_paid_members`, ADR-1092).
--
-- WHAT.
--   1. circles.is_space_primary, with a unique partial index: at most one per Space.
--   2. circles_cap_check widens for the Space Circle only: up to 300 members. Every other Circle keeps its
--      in-person 50 / online 100 ceiling.
--   3. ALWAYS ATTACHED, enforced here rather than trusted to callers:
--        - a Space Circle cannot be deleted while its Space exists (a Space deletion still cascades it);
--        - it cannot be moved to another Space or lose the flag;
--        - a root-Space (personal) Circle can never be one.
--      "Turned off" is status `inactive`, which every public reader already hides (LISTABLE_CIRCLE_STATUS).
--   4. public.ensure_space_circle(space, status): creates the Space's Circle if it has none. Idempotent.
--      An AFTER INSERT trigger on spaces calls it with `active`, so every creation path (createSpace,
--      createBusinessSpace, staff seeding, anything later) gets its Circle without remembering to ask.
--   5. BACKFILL. Royal Temple's existing `royal-temple` Circle becomes its Space Circle with a 300 cap.
--      Every other non-root Space gets a new one, `inactive` (off) per the ruling.
--
-- House style: additive + idempotent (SAFE to re-run). Rollback: drop trigger spaces_ensure_space_circle
-- on public.spaces; drop trigger circles_space_primary_guard on public.circles; drop function
-- public.spaces_ensure_space_circle(); drop function public.circles_space_primary_guard(); drop function
-- public.ensure_space_circle(uuid, group_status); restore circles_cap_check from 20240102000000; update
-- circles set is_space_primary = false; drop index circles_one_space_primary; alter table circles drop
-- column is_space_primary. (The backfilled inactive Circles are ordinary rows and may be left in place.)

alter table public.circles add column if not exists is_space_primary boolean not null default false;

comment on column public.circles.is_space_primary is
  'The Space Circle (ADR-1391): the one primary Circle a Space always has, hosted by the Space, up to 300 members. Off = status inactive.';

create unique index if not exists circles_one_space_primary
  on public.circles (space_id) where is_space_primary;

alter table public.circles drop constraint if exists circles_cap_check;
alter table public.circles
  add constraint circles_cap_check check (
    (is_space_primary and member_cap <= 300)
    or (not is_space_primary and (
      (type = 'in-person'::circle_type and member_cap <= 50)
      or (type = 'online'::circle_type and member_cap <= 100)
    ))
  );

-- ── Always attached ──────────────────────────────────────────────────────────────────────────────
create or replace function public.circles_space_primary_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    -- A Space deletion cascades its Circles after the Space row is gone, so this only refuses a direct
    -- delete of a Space Circle whose Space still exists.
    if old.is_space_primary and exists (select 1 from public.spaces s where s.id = old.space_id) then
      raise exception 'space_circle_is_attached'
        using errcode = 'P0001',
              hint = 'A Space Circle is always attached to its Space. Turn it off instead of deleting it.';
    end if;
    return old;
  end if;

  if old.is_space_primary and (not new.is_space_primary or new.space_id is distinct from old.space_id) then
    raise exception 'space_circle_is_attached'
      using errcode = 'P0001',
            hint = 'A Space Circle stays with its Space. It cannot be moved, transferred to a person, or unmarked.';
  end if;

  if new.is_space_primary and not old.is_space_primary
     and not exists (select 1 from public.spaces s where s.id = new.space_id and s.type <> 'root') then
    raise exception 'space_circle_needs_space'
      using errcode = 'P0001',
            hint = 'Only a Circle a real Space owns can be that Space''s Circle.';
  end if;

  return new;
end
$$;

revoke execute on function public.circles_space_primary_guard() from public, anon, authenticated;

drop trigger if exists circles_space_primary_guard on public.circles;
create trigger circles_space_primary_guard
  before update or delete on public.circles
  for each row execute function public.circles_space_primary_guard();

-- ── Creating one ─────────────────────────────────────────────────────────────────────────────────
-- Returns the Space Circle's id, creating it when the Space has none. Named for the Space, hosted
-- (host_id) by the Space's owner behind the scenes, which is who the Circle's own tools and the owner's
-- membership need; the page names the Space as its host (ADR-1391).
create or replace function public.ensure_space_circle(p_space_id uuid, p_status group_status)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing uuid;
  v_space record;
  v_base text;
  v_slug text;
  v_n integer := 1;
  v_id uuid;
begin
  select id into v_existing from public.circles where space_id = p_space_id and is_space_primary;
  if v_existing is not null then
    return v_existing;
  end if;

  select s.id, s.slug, s.type, coalesce(nullif(s.brand_name, ''), s.name) as label, s.owner_profile_id
    into v_space
    from public.spaces s where s.id = p_space_id;
  if v_space.id is null or v_space.type = 'root' then
    return null;
  end if;

  v_base := coalesce(nullif(v_space.slug, ''), 'space') ;
  v_slug := v_base;
  while exists (select 1 from public.circles where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := case when v_n = 2 then v_base || '-circle' else v_base || '-circle-' || v_n end;
  end loop;

  insert into public.circles (name, slug, type, member_cap, member_count, status, host_id, space_id, access, is_space_primary)
  values (left(v_space.label, 120), v_slug, 'in-person', 300, 0, p_status, v_space.owner_profile_id, p_space_id,
          'space_paid_members', true)
  returning id into v_id;

  insert into public.circle_profiles (circle_id) values (v_id) on conflict do nothing;

  if v_space.owner_profile_id is not null then
    insert into public.memberships (profile_id, circle_id, status, volunteer_role)
    values (v_space.owner_profile_id, v_id, 'active', 'host')
    on conflict (profile_id, circle_id) do nothing;
  end if;

  return v_id;
end
$$;

comment on function public.ensure_space_circle(uuid, group_status) is
  'Create the Space Circle for a Space that has none (ADR-1391). Idempotent. Service role and triggers only.';

revoke execute on function public.ensure_space_circle(uuid, group_status) from public, anon, authenticated;

create or replace function public.spaces_ensure_space_circle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.type <> 'root' then
    perform public.ensure_space_circle(new.id, 'active');
  end if;
  return new;
end
$$;

revoke execute on function public.spaces_ensure_space_circle() from public, anon, authenticated;

drop trigger if exists spaces_ensure_space_circle on public.spaces;
create trigger spaces_ensure_space_circle
  after insert on public.spaces
  for each row execute function public.spaces_ensure_space_circle();

-- ── Backfill ─────────────────────────────────────────────────────────────────────────────────────
-- Royal Temple already runs a Circle named for the Space; it becomes the Space Circle as it is (on).
update public.circles c
   set is_space_primary = true, member_cap = 300
  from public.spaces s
 where s.slug = 'royaltemple' and c.space_id = s.id and c.slug = 'royal-temple'
   and not exists (select 1 from public.circles p where p.space_id = s.id and p.is_space_primary);

-- Every other real Space gets its Space Circle, turned off until its owner switches it on.
do $$
declare r record;
begin
  for r in select s.id from public.spaces s
            where s.type <> 'root'
              and not exists (select 1 from public.circles c where c.space_id = s.id and c.is_space_primary)
  loop
    perform public.ensure_space_circle(r.id, 'inactive');
  end loop;
end $$;
