-- LIVE-882: payment status and fulfillment progress are separate facts. Only the
-- verified session dispatcher may claim/advance these private recovery columns.
do $$
declare existed boolean;
begin
  select exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='commerce_orders' and column_name='settlement_steps') into existed;
  alter table public.commerce_orders add column if not exists settlement_steps jsonb not null default '{}'::jsonb;
  alter table public.commerce_orders add column if not exists settlement_lease uuid;
  alter table public.commerce_orders add column if not exists settlement_lease_until timestamptz;
  -- Historical receipts lacked durable identity. Preserve uncertainty and suppress
  -- retrospective mail; these rows still repair access, stock and accounting.
  -- Run only when introducing the column, so a repeated apply cannot suppress NEW work.
  if not existed then
    update public.commerce_orders set settlement_steps = settlement_steps || '{"receipts":"suppressed_legacy"}'::jsonb
      where status in ('paid','fulfilled');
  end if;
end $$;

-- commerce_orders has owner-facing UPDATE policies. Those policies never grant
-- clients authority over payment recovery, including forged completion on INSERT.
create or replace function public.protect_commerce_settlement_columns()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'commerce_orders' then
    raise exception 'invalid_settlement_trigger_source';
  end if;
  if current_user not in ('service_role','postgres','supabase_admin') then
    if (tg_op = 'INSERT' and (new.settlement_steps <> '{}'::jsonb or new.settlement_lease is not null or new.settlement_lease_until is not null))
      or (tg_op = 'UPDATE' and (new.settlement_steps is distinct from old.settlement_steps
        or new.settlement_lease is distinct from old.settlement_lease
        or new.settlement_lease_until is distinct from old.settlement_lease_until)) then
      raise exception 'settlement_columns_are_service_only' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_commerce_settlement_columns on public.commerce_orders;
create trigger protect_commerce_settlement_columns before insert or update on public.commerce_orders
  for each row execute function public.protect_commerce_settlement_columns();
revoke execute on function public.protect_commerce_settlement_columns() from public, anon, authenticated;
grant execute on function public.protect_commerce_settlement_columns() to service_role;

create or replace function public.claim_commerce_settlement(
  _order uuid, _session text, _payment_intent text, _amount integer, _currency text, _token uuid
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare o public.commerce_orders%rowtype;
begin
  select * into o from public.commerce_orders where id = _order for update;
  if not found or o.status not in ('paid','fulfilled') or _token is null
    or _payment_intent is null or _amount is null or _currency is null
    or o.stripe_checkout_session_id is distinct from _session
    or o.stripe_payment_intent_id is distinct from _payment_intent
    or o.amount_cents is distinct from _amount
    or lower(o.currency) is distinct from lower(_currency) then
    return jsonb_build_object('state','refused');
  end if;
  if o.settlement_steps @> '{"inventory":true,"finance":true,"booking":true,"journey":true}'::jsonb
    and o.settlement_steps->>'receipts' in ('true','suppressed_legacy') then
    return jsonb_build_object('state','complete');
  end if;
  if o.settlement_lease_until > now() and o.settlement_lease is distinct from _token then
    return jsonb_build_object('state','busy');
  end if;
  update public.commerce_orders set settlement_lease = _token,
    settlement_lease_until = now() + interval '3 minutes' where id = _order;
  return jsonb_build_object('state','claimed','steps',o.settlement_steps);
end $$;

create or replace function public.advance_commerce_settlement(_order uuid, _token uuid, _step text default null)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if _token is null or (_step is not null and _step not in ('inventory','finance','booking','journey','receipts')) then
    return false;
  end if;
  update public.commerce_orders set
    settlement_steps = settlement_steps || case when _step is null then '{}'::jsonb else jsonb_build_object(_step,true) end,
    settlement_lease_until = now() + interval '3 minutes'
    where id = _order and status in ('paid','fulfilled') and settlement_lease = _token
      and settlement_lease_until > now();
  return found;
end $$;

create or replace function public.release_commerce_settlement(_order uuid, _token uuid)
returns void language sql security invoker set search_path = public as $$
  update public.commerce_orders set settlement_lease = null, settlement_lease_until = null
    where id = _order and settlement_lease = _token;
$$;

revoke execute on function public.claim_commerce_settlement(uuid,text,text,integer,text,uuid) from public, anon, authenticated;
revoke execute on function public.advance_commerce_settlement(uuid,uuid,text) from public, anon, authenticated;
revoke execute on function public.release_commerce_settlement(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_commerce_settlement(uuid,text,text,integer,text,uuid) to service_role;
grant execute on function public.advance_commerce_settlement(uuid,uuid,text) to service_role;
grant execute on function public.release_commerce_settlement(uuid,uuid) to service_role;

-- The lesson door currently reads legacy active adoption as well as progress
-- enrollment. Both access writes must commit behind the SAME paid-order lock.
alter table public.journey_plan_adoptions add column if not exists order_id uuid
  references public.commerce_orders(id) on delete set null;
create index if not exists journey_plan_adoptions_order_idx on public.journey_plan_adoptions(order_id) where order_id is not null;
create or replace function public.protect_paid_journey_provenance()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'journey_plan_adoptions' then
    raise exception 'invalid_paid_journey_trigger_source';
  end if;
  if current_user not in ('service_role','postgres','supabase_admin') then
    if (tg_op='INSERT' and new.order_id is not null)
      or (tg_op='UPDATE' and new.order_id is distinct from old.order_id) then
      raise exception 'paid_journey_provenance_is_service_only' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_paid_journey_provenance on public.journey_plan_adoptions;
create trigger protect_paid_journey_provenance before insert or update on public.journey_plan_adoptions
 for each row execute function public.protect_paid_journey_provenance();

create or replace function public.grant_paid_commerce_journey(_order uuid,_plan uuid,_profile uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare o public.commerce_orders%rowtype; a public.journey_plan_adoptions%rowtype; e public.journey_enrollments%rowtype; fresh boolean := false;
begin
  select * into o from public.commerce_orders where id=_order for update;
  if not found or o.status not in ('paid','fulfilled') or _profile is null
    or o.buyer_profile_id is distinct from _profile or not exists(
      select 1 from public.commerce_order_items i join public.commerce_products p on p.id=i.product_id
      where i.order_id=o.id and p.product_kind='journey' and p.journey_plan_id=_plan
    ) then return jsonb_build_object('state','refused'); end if;
  -- Never steal a free/cohort/other-order enrollment. A fresh SOLO enrollment
  -- and its order provenance are inserted together, not stamped in a later call.
  insert into public.journey_enrollments(profile_id,plan_id,order_id)
    values(_profile,_plan,_order)
    on conflict(profile_id,plan_id) where run_id is null do nothing;
  select * into e from public.journey_enrollments where profile_id=_profile and plan_id=_plan and run_id is null for update;
  insert into public.journey_plan_adoptions(profile_id,plan_id,active,order_id)
    values(_profile,_plan,true,e.order_id) on conflict(plan_id,profile_id) do nothing
    returning true into fresh;
  select * into a from public.journey_plan_adoptions where profile_id=_profile and plan_id=_plan for update;
  -- An active unrelated grant is already authority. Preserve its provenance.
  -- An inactive adoption is not access; a paid re-entry gets its own provenance.
  if not a.active then
    update public.journey_plan_adoptions set active=true,order_id=e.order_id where id=a.id;
  end if;
  return jsonb_build_object('state','granted','new_adoption',coalesce(fresh,false));
end $$;

create or replace function public.revoke_refunded_commerce_journeys(_order uuid)
returns boolean language plpgsql security invoker set search_path=public as $$
declare o public.commerce_orders%rowtype;
begin
  select * into o from public.commerce_orders where id=_order for update;
  if not found or o.status <> 'refunded' then return false; end if;
  -- A completed Journey remains completed, including its legacy lesson access.
  update public.journey_plan_adoptions a set active=false
    where a.order_id=_order and not exists(
      select 1 from public.journey_enrollments e where e.profile_id=a.profile_id
        and e.plan_id=a.plan_id and e.completed_at is not null
    );
  delete from public.journey_enrollments where order_id=_order and completed_at is null;
  return true;
end $$;
revoke execute on function public.protect_paid_journey_provenance() from public,anon,authenticated;
revoke execute on function public.grant_paid_commerce_journey(uuid,uuid,uuid) from public,anon,authenticated;
revoke execute on function public.revoke_refunded_commerce_journeys(uuid) from public,anon,authenticated;
grant execute on function public.protect_paid_journey_provenance() to service_role;
grant execute on function public.grant_paid_commerce_journey(uuid,uuid,uuid) to service_role;
grant execute on function public.revoke_refunded_commerce_journeys(uuid) to service_role;

-- Fence the existing atomic stock operation at its own serialization point.
create or replace function public.decrement_commerce_stock_atomic(
  _order uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_already boolean;
  v_status text;
  v_rec     record;
begin
  if _order is null then
    raise exception 'invalid_order' using errcode = 'P0001';
  end if;

  select coalesce((metadata->>'inventory_decremented')::boolean, false), status
    into v_already, v_status
    from public.commerce_orders
   where id = _order
   for update;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  -- A lease refresh outside this transaction cannot authorize inventory after a refund.
  -- The status check and mutation share the SAME order lock as refund/restore.
  if v_status not in ('paid','fulfilled') then
    raise exception 'order_not_paid' using errcode = 'P0001';
  end if;
  if v_already then
    return;  -- already decremented for this order; no-op (idempotent)
  end if;

  -- Pass 1: variant-tracked items. Lock each tracked variant, decrement or fail.
  for v_rec in
    select oi.variant_id as variant_id, sum(oi.qty)::integer as need
      from public.commerce_order_items oi
      join public.commerce_variants v on v.id = oi.variant_id
     where oi.order_id = _order
       and oi.variant_id is not null
       and v.stock is not null
     group by oi.variant_id
  loop
    update public.commerce_variants
       set stock = stock - v_rec.need
     where id = v_rec.variant_id
       and stock >= v_rec.need;

    if not found then
      raise exception 'out_of_stock' using errcode = 'P0001';
    end if;
  end loop;

  -- Pass 2: product-tracked items WITHOUT a variant. A variant-selected item is handled
  -- above and must not also decrement product stock, hence variant_id is null here.
  for v_rec in
    select oi.product_id as product_id, sum(oi.qty)::integer as need
      from public.commerce_order_items oi
      join public.commerce_products p on p.id = oi.product_id
     where oi.order_id = _order
       and oi.variant_id is null
       and oi.product_id is not null
       and p.stock is not null
     group by oi.product_id
  loop
    update public.commerce_products
       set stock = stock - v_rec.need
     where id = v_rec.product_id
       and stock >= v_rec.need;

    if not found then
      raise exception 'out_of_stock' using errcode = 'P0001';
    end if;
  end loop;

  update public.commerce_orders
     set metadata = metadata || jsonb_build_object('inventory_decremented', true)
   where id = _order;
end;
$$;

revoke execute on function public.decrement_commerce_stock_atomic(uuid) from public, anon, authenticated;
grant execute on function public.decrement_commerce_stock_atomic(uuid) to service_role;

-- A delayed paid confirmation must not create a new booking grant after refund committed.
create or replace function public.confirm_paid_commerce_booking(_order uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
declare v_status text;
begin
  select status into v_status from public.commerce_orders where id=_order for update;
  if not found or v_status not in ('paid','fulfilled') then return false; end if;
  update public.space_bookings set status='confirmed' where order_id=_order and status='pending';
  return true; -- Ordinary goods have no linked booking; that is an intentional successful no-op.
end $$;
revoke all on function public.confirm_paid_commerce_booking(uuid) from public, anon, authenticated;
grant execute on function public.confirm_paid_commerce_booking(uuid) to service_role;
