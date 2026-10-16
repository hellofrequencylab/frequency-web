-- SCAN-960 (owner ruling 2026-10-15, the Collective / Network split): a Network's same-owner children are
-- its chapters. The attach function now admits a `network` parent with ten included chapters (more is a
-- quote, so no extra quantity applies), and never lets a Network become someone else's child.
-- Collective behaviour is unchanged: existing Collectives keep their member Spaces and extra Spaces.
--
-- Additive and idempotent: create or replace of the same function signature; grants re-stated.

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
  if v_parent.status <> 'active' or v_parent.plan not in ('collective', 'nonprofit_collective', 'network')
    or v_parent.plan is null or v_child.status <> 'active'
    or v_child.plan in ('collective', 'nonprofit_collective', 'network')
    or v_parent.parent_id is not null
    or exists (select 1 from public.spaces where parent_id = p_child_id) then
    raise exception 'collective_invalid';
  end if;
  if v_child.parent_id = p_parent_id then return; end if;
  if v_child.parent_id is not null then raise exception 'collective_already_attached'; end if;
  -- A Network holds its ten included chapters (NETWORK_PLAN.includedChapters); more is a quote, so no
  -- self-serve quantity applies to it.
  if v_parent.plan = 'network' then
    select count(*) into v_used from public.spaces where parent_id = p_parent_id;
    if v_used >= 10 then raise exception 'collective_full'; end if;
    update public.spaces set parent_id = p_parent_id where id = p_child_id;
    return;
  end if;
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
