-- Generated with `supabase migration new collective_member_spaces` at 20261008175301;
-- sequenced after the existing future-dated schema migrations for clean database replays.
-- Private billing reservation: no browser column grants are added.
alter table public.spaces
  add column collective_space_change_token uuid,
  add column collective_space_change_until timestamptz,
  add column collective_space_change_target integer;

-- LIVE-763. Service-only mutation: the server authenticates p_owner_id, and this transaction
-- checks BOTH owners. Lock the parent before counting so simultaneous attaches cannot oversell.
create or replace function public.set_collective_member_space(
  p_parent_id uuid, p_child_id uuid, p_owner_id uuid, p_attach boolean
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_parent public.spaces%rowtype;
  v_child public.spaces%rowtype;
  v_capacity bigint;
  v_used bigint;
begin
  if p_owner_id is null or p_parent_id is null or p_child_id is null or p_parent_id = p_child_id or p_attach is null then
    raise exception 'collective_invalid';
  end if;
  -- Deterministic ordering also prevents cross-parent attach/detach deadlocks.
  perform id from public.spaces where id in (p_parent_id, p_child_id) order by id for update;
  select * into v_parent from public.spaces where id = p_parent_id;
  select * into v_child from public.spaces where id = p_child_id;
  if v_parent.id is null or v_child.id is null or v_parent.owner_profile_id is distinct from p_owner_id
    or v_child.owner_profile_id is distinct from p_owner_id or v_parent.type = 'root' or v_child.type = 'root' then
    raise exception 'collective_forbidden';
  end if;
  -- Detach remains possible after cancellation/suspension, and never rewrites the child's plan.
  if not p_attach then
    if v_child.parent_id is distinct from p_parent_id then raise exception 'collective_invalid'; end if;
    update public.spaces set parent_id = null where id = p_child_id;
    return;
  end if;
  if v_parent.status <> 'active' or v_parent.plan not in ('collective', 'nonprofit_collective')
    or v_parent.plan is null or v_child.status <> 'active'
    or v_child.plan in ('collective', 'nonprofit_collective')
    or v_parent.parent_id is not null
    or exists (select 1 from public.spaces where parent_id = p_child_id) then
    raise exception 'collective_invalid';
  end if;
  if v_child.parent_id = p_parent_id then return; end if;
  if v_child.parent_id is not null then raise exception 'collective_already_attached'; end if;
  select 5 + coalesce(sum(quantity), 0) into v_capacity from public.space_subscription_items
    where space_id = p_parent_id and item_key = 'collective_space'
      and status in ('active', 'trialing', 'past_due') and quantity > 0;
  if v_parent.collective_space_change_until > clock_timestamp() and v_parent.collective_space_change_target is not null then
    v_capacity := least(v_capacity, 5 + v_parent.collective_space_change_target);
  end if;
  select count(*) into v_used from public.spaces where parent_id = p_parent_id;
  if v_used >= v_capacity then raise exception 'collective_full'; end if;
  update public.spaces set parent_id = p_parent_id where id = p_child_id;
end;
$$;
revoke all on function public.set_collective_member_space(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_collective_member_space(uuid, uuid, uuid, boolean) to service_role;

-- Reserve a quantity change under the same parent lock as attach. A reduction constrains new
-- attachments until Stripe and the local subscription-item ledger agree. Stripe runs outside SQL.
create function public.begin_collective_space_change(p_parent_id uuid, p_owner_id uuid, p_target integer, p_token uuid)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_parent public.spaces%rowtype; v_used integer;
begin
  select * into v_parent from public.spaces where id = p_parent_id for update;
  if v_parent.id is null or v_parent.owner_profile_id is distinct from p_owner_id or p_owner_id is null
    or v_parent.status <> 'active' or v_parent.plan is null
    or v_parent.plan not in ('collective', 'nonprofit_collective') or v_parent.type = 'root'
    or p_target is null or p_target < 0 or p_target > 2147483642 or p_token is null then raise exception 'collective_invalid'; end if;
  if v_parent.collective_space_change_until > clock_timestamp() then return false; end if;
  select count(*) into v_used from public.spaces where parent_id = p_parent_id;
  if p_target < greatest(0, v_used - 5) then raise exception 'collective_quantity_floor'; end if;
  update public.spaces set collective_space_change_token = p_token,
    collective_space_change_until = clock_timestamp() + interval '5 minutes',
    collective_space_change_target = p_target where id = p_parent_id;
  return true;
end;
$$;
create function public.finish_collective_space_change(p_parent_id uuid, p_token uuid)
returns void language sql security invoker set search_path = public, pg_temp as $$
  update public.spaces set collective_space_change_token = null,
    collective_space_change_until = null, collective_space_change_target = null
  where id = p_parent_id and collective_space_change_token = p_token;
$$;
revoke all on function public.begin_collective_space_change(uuid,uuid,integer,uuid) from public, anon, authenticated;
revoke all on function public.finish_collective_space_change(uuid,uuid) from public, anon, authenticated;
grant execute on function public.begin_collective_space_change(uuid,uuid,integer,uuid) to service_role;
grant execute on function public.finish_collective_space_change(uuid,uuid) to service_role;
