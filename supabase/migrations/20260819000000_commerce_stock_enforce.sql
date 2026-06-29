-- =============================================================================
-- Enforce commerce inventory (ADR-39X follow-up). Decision: enforce (no oversell).
--
-- 20260815000000_commerce_core.sql declares commerce_products.stock as
-- 'null = untracked/unlimited; >= 0 = tracked stock (decremented on paid)', but
-- NOTHING decremented it: a paid order never touched stock, so tracked SKUs could
-- oversell without bound. This adds the atomic decrement the comment promised.
--
-- decrement_commerce_stock_atomic(_order): for one paid order, lock each
-- tracked-stock product (FOR UPDATE serializes concurrent paid orders for the same
-- product), sum THIS order's item quantities per product, and subtract from stock.
-- RAISE 'out_of_stock' (typed SQLSTATE P0001 the app maps to clean copy) if any
-- product cannot cover its quantity, so two concurrent checkouts cannot oversell.
-- Untracked products (stock is null) are skipped and stay unlimited.
--
-- Idempotent on the order: a marker (metadata->>'inventory_decremented') is stamped
-- inside the same transaction and re-entry no-ops. The caller already gates the
-- pending->paid flip exactly-once, but a retried/concurrent settle must never
-- double-decrement, so the guard lives in the RPC.
--
-- House style (matches 20260726000000): additive + idempotent
-- (CREATE OR REPLACE FUNCTION), SECURITY DEFINER with a pinned search_path, locked
-- to service_role (ADR-371: revoke from public, anon, authenticated). SAFE to
-- re-run. No em or en dashes.
--
-- NOTE (owner): like ADR-371 / 20260818000100, this repo migration does not
-- retroactively alter the LIVE database -- apply to production (Supabase MCP /
-- dashboard) and record it, or the deployed function stands until then.
--
-- ROLLBACK:
--   drop function if exists public.decrement_commerce_stock_atomic(uuid);
-- =============================================================================

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
  v_rec     record;
begin
  if _order is null then
    raise exception 'invalid_order' using errcode = 'P0001';
  end if;

  -- Lock the order row + read the idempotency marker in one shot. Concurrent
  -- settle calls for the same order serialize here; the second sees the marker.
  select coalesce((metadata->>'inventory_decremented')::boolean, false)
    into v_already
    from public.commerce_orders
   where id = _order
   for update;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_already then
    return;  -- already decremented for this order; no-op (idempotent)
  end if;

  -- Walk each product this order bought, summing quantities (multiple line items
  -- can hit the same product). Lock only TRACKED-stock products; untracked
  -- (stock is null) products are skipped entirely and stay unlimited.
  for v_rec in
    select oi.product_id as product_id, sum(oi.qty)::integer as need
      from public.commerce_order_items oi
      join public.commerce_products p on p.id = oi.product_id
     where oi.order_id = _order
       and oi.product_id is not null
       and p.stock is not null
     group by oi.product_id
  loop
    -- Lock the product row, recheck stock under the lock, decrement or fail.
    update public.commerce_products
       set stock = stock - v_rec.need
     where id = v_rec.product_id
       and stock >= v_rec.need;

    if not found then
      raise exception 'out_of_stock' using errcode = 'P0001';
    end if;
  end loop;

  -- Stamp the idempotency marker inside the same transaction.
  update public.commerce_orders
     set metadata = metadata || jsonb_build_object('inventory_decremented', true)
   where id = _order;
end;
$$;

-- The RPC runs as SECURITY DEFINER and is only ever called from the already-
-- authorized Stripe webhook settle path through the service role. Lock it down
-- (ADR-371): on Supabase a new public function is auto-granted EXECUTE to anon AND
-- authenticated directly, so revoke those by name, not just PUBLIC.
revoke execute on function public.decrement_commerce_stock_atomic(uuid) from public, anon, authenticated;
grant execute on function public.decrement_commerce_stock_atomic(uuid) to service_role;

comment on function public.decrement_commerce_stock_atomic(uuid) is
  'Atomic per-order stock decrement for paid commerce orders. Locks each tracked-stock product, subtracts this order''s quantities, raises out_of_stock (P0001) on insufficient stock, idempotent via metadata.inventory_decremented. service_role only. ADR-39X.';
