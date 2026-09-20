-- LIVE-436 / ADR-1485: Circle `tier` access follows the free membership floor.
--
-- ADR-1415 (LIVE-410) let a free Space sell memberships. Connect readiness is the
-- checkout door. The leftover wall was here: `private.space_can_sell` still ranked
-- on Business+, so a free Space could sell a membership and could not include a
-- Circle with that membership (access = 'tier', or a priced tier linked to a Circle).
--
-- Plan is not the door. A personal Circle still cannot sell: it lives on the root
-- sentinel, and `circle_access_needs_space` / `circle_link_cross_tenant` stay.
-- Checkout still refuses when Connect is not payout-ready (LIVE-233 / LIVE-339).
--
-- Apply with execute_sql, then insert supabase_migrations.schema_migrations
-- at version 20270345006800. Do not apply_migration. Do not db push.
--
-- ROLLBACK:
--   Restore private.space_can_sell, public.enforce_circle_access_shape, and
--   public.enforce_membership_tier_circle_link from 20270319000000 /
--   20270227000000.

-- ── 1. May this Space charge? A real Space, any plan. ─────────────────────────────────

create or replace function private.space_can_sell(p_space_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select exists (
    select 1
    from public.spaces s
    where s.id = p_space_id
      and s.type <> 'root'
  );
$$;

revoke all on function private.space_can_sell(uuid) from public, anon, authenticated;
grant execute on function private.space_can_sell(uuid) to authenticated, service_role;

comment on function private.space_can_sell(uuid) is
  'May this Space charge? (ADR-1485 / LIVE-436, extends ADR-1415 / LIVE-410). True for a non-root Space. Plan is not the door; Connect readiness still refuses checkout. The root Space can never sell, which is what makes a personal Circle free by construction.';

-- ── 2. Shape trigger: Space modes still need a real Space. No plan floor. ─────────────

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
  end if;

  return new;
end;
$$;

drop trigger if exists trg_circles_access_shape on public.circles;
create trigger trg_circles_access_shape
  before insert or update on public.circles
  for each row execute function public.enforce_circle_access_shape();

-- ── 3. Tier-to-Circle link: tenancy stays. No plan floor. ─────────────────────────────

create or replace function public.enforce_membership_tier_circle_link()
returns trigger
language plpgsql
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_circle_space uuid;
begin
  if new.circle_id is null then
    return new;
  end if;

  select c.space_id into v_circle_space
  from public.circles c
  where c.id = new.circle_id;

  if v_circle_space is null then
    raise exception 'circle_link_unknown_circle'
      using errcode = 'P0001',
            hint = 'The Circle a membership tier links to must exist and carry a space_id.';
  end if;

  if v_circle_space is distinct from new.space_id then
    raise exception 'circle_link_cross_tenant'
      using errcode = 'P0001',
            hint = 'A membership tier may only link to a Circle its own Space owns. A personal Circle (root Space) can never be sold.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_membership_tier_circle_link on public.space_membership_tiers;
create trigger trg_membership_tier_circle_link
  before insert or update on public.space_membership_tiers
  for each row execute function public.enforce_membership_tier_circle_link();
