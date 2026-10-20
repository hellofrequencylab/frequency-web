-- LIVE-1183 (owner rulings 2026-10-20, ADR-1815): the Partner Network is $149 plus $59 a chapter with THREE
-- chapters included (it was ten) and a Founding year. Two halves:
--
-- 1. pricing_stripe_prices repoints the six Network keys to the prices minted on the live account today
--    (base $326/$3,260 covers the first three chapters, chapter $59/$590, nonprofit base $260/$2,600) and
--    adds the Non Profit chapter ($47/$470) on its own product. Network has no separate founding price
--    (Founding is a coupon on the first yearly invoice), so each `_list` key points at the same price as its
--    founding key, as 20270346009100 wrote them. The old prices stay active in Stripe so a current
--    subscriber keeps billing; they are no longer resolvable by key.
-- 2. The two chapter-capacity functions count three included chapters and allow 22 extra (25 in all).
--    Existing attached chapters are never detached; a Network above its capacity just cannot attach more
--    until it buys the difference.
--
-- Idempotent: updates are by key, the insert skips existing keys, the functions are create or replace.

begin;

update public.pricing_stripe_prices set stripe_price_id = v.price_id
from (values
  ('network_base_month',           'price_1USlPEPhyalyRPP1XtS07x5C'),
  ('network_base_month_list',      'price_1USlPEPhyalyRPP1XtS07x5C'),
  ('network_base_year',            'price_1USlPQPhyalyRPP1I0zru3n0'),
  ('network_base_year_list',       'price_1USlPQPhyalyRPP1I0zru3n0'),
  ('nonprofit_network_month',      'price_1USlPYPhyalyRPP11VYroOFv'),
  ('nonprofit_network_month_list', 'price_1USlPYPhyalyRPP11VYroOFv'),
  ('nonprofit_network_year',       'price_1USlPtPhyalyRPP1SwJZww2M'),
  ('nonprofit_network_year_list',  'price_1USlPtPhyalyRPP1SwJZww2M'),
  ('network_chapter_month',        'price_1USlQ6PhyalyRPP1MpJm3LLu'),
  ('network_chapter_month_list',   'price_1USlQ6PhyalyRPP1MpJm3LLu'),
  ('network_chapter_year',         'price_1USlQFPhyalyRPP1lmjAXTtE'),
  ('network_chapter_year_list',    'price_1USlQFPhyalyRPP1lmjAXTtE')
) as v(key, price_id)
where public.pricing_stripe_prices.key = v.key;

insert into public.pricing_stripe_prices (key, stripe_product_id, stripe_price_id, archived, stripe_account_id, livemode)
values
  ('nonprofit_network_chapter_month',      'prod_VTiqS3aB2uywow', 'price_1USlQQPhyalyRPP1LGmg7nz5', false, 'acct_1TdurHPhyalyRPP1', true),
  ('nonprofit_network_chapter_month_list', 'prod_VTiqS3aB2uywow', 'price_1USlQQPhyalyRPP1LGmg7nz5', true,  'acct_1TdurHPhyalyRPP1', true),
  ('nonprofit_network_chapter_year',       'prod_VTiqS3aB2uywow', 'price_1USlQbPhyalyRPP1v36fTc61', false, 'acct_1TdurHPhyalyRPP1', true),
  ('nonprofit_network_chapter_year_list',  'prod_VTiqS3aB2uywow', 'price_1USlQbPhyalyRPP1v36fTc61', true,  'acct_1TdurHPhyalyRPP1', true)
on conflict (key) do nothing;

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
  if v_parent.plan = 'network' then
    -- Three included chapters (NETWORK_PLAN.includedChapters) plus the live network_chapter quantity, never
    -- past 25 (NETWORK_PLAN.maxChapters): more than that is a quote (SCAN-1008).
    select 3 + coalesce(sum(quantity), 0) into v_capacity from public.space_subscription_items
      where space_id = p_parent_id and item_key = 'network_chapter'
        and status in ('active', 'trialing', 'past_due') and quantity > 0;
    if v_parent.collective_space_change_until > clock_timestamp() and v_parent.collective_space_change_target is not null then
      v_capacity := least(v_capacity, 3 + v_parent.collective_space_change_target);
    end if;
    v_capacity := least(v_capacity, 25);
  else
    select 5 + coalesce(sum(quantity), 0) into v_capacity from public.space_subscription_items
      where space_id = p_parent_id and item_key = 'collective_space'
        and status in ('active', 'trialing', 'past_due') and quantity > 0;
    if v_parent.collective_space_change_until > clock_timestamp() and v_parent.collective_space_change_target is not null then
      v_capacity := least(v_capacity, 5 + v_parent.collective_space_change_target);
    end if;
  end if;
  select count(*) into v_used from public.spaces where parent_id = p_parent_id;
  if v_used >= v_capacity then raise exception 'collective_full'; end if;
  update public.spaces set parent_id = p_parent_id where id = p_child_id;
end;
$$;
revoke all on function public.set_collective_member_space(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_collective_member_space(uuid, uuid, uuid, boolean) to service_role;

create or replace function public.begin_collective_space_change(p_parent_id uuid, p_owner_id uuid, p_target integer, p_token uuid)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_parent public.spaces%rowtype; v_used integer; v_included integer;
begin
  select * into v_parent from public.spaces where id = p_parent_id for update;
  if v_parent.id is null or v_parent.owner_profile_id is distinct from p_owner_id or p_owner_id is null
    or v_parent.status <> 'active' or v_parent.plan is null
    or v_parent.plan not in ('collective', 'nonprofit_collective', 'network') or v_parent.type = 'root'
    or p_target is null or p_target < 0 or p_target > 2147483642 or p_token is null then raise exception 'collective_invalid'; end if;
  -- A Network sells at most 22 extra chapters (25 in all, NETWORK_PLAN.maxChapters); past that is a quote.
  if v_parent.plan = 'network' and p_target > 22 then raise exception 'collective_invalid'; end if;
  if v_parent.collective_space_change_until > clock_timestamp() then return false; end if;
  v_included := case when v_parent.plan = 'network' then 3 else 5 end;
  select count(*) into v_used from public.spaces where parent_id = p_parent_id;
  if p_target < greatest(0, v_used - v_included) then raise exception 'collective_quantity_floor'; end if;
  update public.spaces set collective_space_change_token = p_token,
    collective_space_change_until = clock_timestamp() + interval '5 minutes',
    collective_space_change_target = p_target where id = p_parent_id;
  return true;
end;
$$;
revoke all on function public.begin_collective_space_change(uuid,uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.begin_collective_space_change(uuid,uuid,integer,uuid) to service_role;

commit;
