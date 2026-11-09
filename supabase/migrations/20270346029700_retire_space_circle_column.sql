-- RETIRE THE SPACE CIRCLE, PART 2 OF 2: DROP THE FLAG (ADR-1938, LIVE-2081).
--
-- RUN ONLY AFTER the code without any is_space_primary read is live in production (the deploy is
-- READY). Dropping the column under older code breaks every Circle read that names it.
--
-- Removes circles.is_space_primary, its guard, its unique index, its cap arm, the enrolment and
-- roster functions, and the opt-out table (0 rows on production, 2026-11-04). The archived rows stay
-- (status 'archived', outside every listing); their slugs live on in public.retired_space_circles
-- (20270346029600).
--
-- Idempotent: every step is guarded, so a second run changes nothing.
--
-- Rollback: no reader is left, so there is no reason to bring the column back. If one is needed:
-- `alter table public.circles add column is_space_primary boolean not null default false`, then
-- `update public.circles c set is_space_primary = true from public.retired_space_circles r where r.circle_id = c.id`.

do $$
begin
  if to_regclass('public.retired_space_circles') is null then
    raise exception 'retire_space_circle_column: run 20270346029600 first' using errcode = 'P0001';
  end if;
end $$;

-- ── 1. The guard, the triggers' functions and the roster helpers ────────────────────────────────────
drop trigger if exists circles_space_primary_guard on public.circles;
drop trigger if exists spaces_ensure_space_circle on public.spaces;
drop trigger if exists space_memberships_enrol_space_circle on public.space_memberships;
drop trigger if exists memberships_space_circle_optout on public.memberships;
drop function if exists public.circles_space_primary_guard();
drop function if exists public.spaces_ensure_space_circle();
drop function if exists public.space_memberships_enrol_space_circle();
drop function if exists public.memberships_space_circle_optout();
drop function if exists public.ensure_space_circle(uuid, public.group_status);
drop function if exists public.enrol_in_space_circle(uuid, uuid);
drop function if exists public.sync_space_circle_roster(uuid);

-- ── 2. The opt-out table (empty) ────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.space_circle_optouts') is not null then
    if exists (select 1 from public.space_circle_optouts) then
      raise exception 'retire_space_circle_column: space_circle_optouts is not empty' using errcode = 'P0001';
    end if;
    drop table public.space_circle_optouts;
  end if;
end $$;

-- ── 3. One cap rule for every Circle ────────────────────────────────────────────────────────────────
-- The archived Space Circles carried the 300 cap; bring them under the topic cap before the check
-- loses its Space arm. They are archived, so nobody joins them either way.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'circles' and column_name = 'is_space_primary') then
    execute $q$
      update public.circles
         set member_cap = case when type = 'online' then 100 else 50 end
       where is_space_primary
         and member_cap > case when type = 'online' then 100 else 50 end
    $q$;
  end if;
end $$;
alter table public.circles drop constraint if exists circles_cap_check;
alter table public.circles add constraint circles_cap_check check (
  (type = 'in-person' and member_cap <= 50) or (type = 'online' and member_cap <= 100)
);

-- ── 4. The column ───────────────────────────────────────────────────────────────────────────────────
drop index if exists public.circles_one_space_primary;
alter table public.circles drop column if exists is_space_primary;
