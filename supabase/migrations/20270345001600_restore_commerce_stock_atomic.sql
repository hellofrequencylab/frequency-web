-- A refunded order's stock came back through a COMPARE-AND-SWAP LOOP IN THE APP, and the loop
-- could give up. LIVE-161 (ADR-1209), the inverse of decrement_commerce_stock_atomic.
--
-- What shipped in phase C (lib/commerce/checkout.ts, restoreStockRow) was, per item:
--
--     for attempt in 0..4:
--       select stock from commerce_products where id = ?          -- request 1, no row lock
--       update commerce_products set stock = <read + qty>
--        where id = ? and stock = <read>                          -- request 2, guarded
--       if rows_affected: return
--     console.error('lost the compare-and-swap race')             -- and the stock is GONE
--
-- The guard was real -- it never overwrote a concurrent sale -- but three things it could not do:
--
--   1. IT COULD LOSE. Five lost races and the units are silently never returned. A guard that
--      gives up is a guard with a failure mode, and this one's failure mode is a permanently
--      sold-out product that has stock.
--   2. THE MARKER WAS A THIRD REQUEST. `metadata.inventory_restored` was stamped only after every
--      item had been walked. A crash between the increments and the stamp leaves the order
--      restored but unmarked; nothing re-enters today (the status flip is exactly-once) but
--      nothing in the DATA says the restore happened either.
--   3. TWO RESTORERS OF ONE ORDER BOTH PASSED THE CHECK. The `inventory_restored` read and the
--      increments were separate requests with no lock between them, so two callers arriving
--      together (the inline reconcile and the charge.refunded webhook) could both read "not yet
--      restored" and both increment. Nothing is subtracted twice, but stock could be ADDED twice.
--
-- WHAT THIS RPC GUARANTEES THAT THE OLD PATH DID NOT:
--
--   * ONE TRANSACTION. The idempotency read, every increment, and the `inventory_restored` marker
--     commit together or not at all. There is no window in which the shelf is refilled and the
--     order does not say so, and no window in which the order says so and the shelf is not.
--   * NO LOST UPDATE AND NO RETRY. `set stock = stock + n` re-reads the row under the lock the
--     UPDATE itself takes, so a concurrent sale between the read and the write is impossible by
--     construction rather than detected-and-retried. There is no attempt budget to exhaust.
--   * CONCURRENT RESTORERS SERIALISE. `select ... for update` on the order row holds until commit,
--     so the second caller blocks, then reads `inventory_restored = true` and no-ops. Exactly-once
--     is enforced by the database, not by the caller being the only one running.
--
-- Everything else mirrors 20261132000000's decrement exactly, because a restore that does not
-- mirror the decrement gives back the wrong units: a variant-selected item restores the VARIANT's
-- stock and NEVER its parent product's, a plain item restores the PRODUCT's, and an untracked row
-- (stock null at whichever level governs) is skipped because nothing was taken from it. Quantities
-- are summed per target the same way, so two order lines for one product restore in one statement.
--
-- Ordering: both passes walk their targets in id order, so two restores that overlap on two
-- products take the row locks in the same sequence and cannot deadlock against each other.
--
-- Safe to re-run (create or replace). No em or en dashes.
--
-- ROLLBACK:
--   drop function if exists public.restore_commerce_stock_atomic(uuid);

create or replace function public.restore_commerce_stock_atomic(_order uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_decremented boolean;
  v_restored    boolean;
  v_rec         record;
begin
  if _order is null then
    raise exception 'invalid_order' using errcode = 'P0001';
  end if;

  -- The serialisation point. Held to commit, so a second restorer of this order waits here and
  -- then sees the marker below rather than racing the increments.
  select coalesce((metadata->>'inventory_decremented')::boolean, false),
         coalesce((metadata->>'inventory_restored')::boolean, false)
    into v_decremented, v_restored
    from public.commerce_orders
   where id = _order
   for update;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  -- Never decremented (a pre-enforcement order, or a decrement that failed soft): there is
  -- nothing on loan to give back, and inventing units here would OVERSTATE stock.
  if not v_decremented then
    return;
  end if;

  -- Already given back. Idempotent.
  if v_restored then
    return;
  end if;

  -- Pass 1: variant-tracked items. The variant governs; its parent product is untouched.
  for v_rec in
    select oi.variant_id as variant_id, sum(oi.qty)::integer as back
      from public.commerce_order_items oi
      join public.commerce_variants v on v.id = oi.variant_id
     where oi.order_id = _order
       and oi.variant_id is not null
       and v.stock is not null
     group by oi.variant_id
     order by 1
  loop
    update public.commerce_variants
       set stock = stock + v_rec.back
     where id = v_rec.variant_id
       and stock is not null;  -- turned untracked since the sale: unlimited already, nothing to add
  end loop;

  -- Pass 2: product-tracked items WITHOUT a variant (a variant item is handled above and must not
  -- also restore product stock).
  for v_rec in
    select oi.product_id as product_id, sum(oi.qty)::integer as back
      from public.commerce_order_items oi
      join public.commerce_products p on p.id = oi.product_id
     where oi.order_id = _order
       and oi.variant_id is null
       and oi.product_id is not null
       and p.stock is not null
     group by oi.product_id
     order by 1
  loop
    update public.commerce_products
       set stock = stock + v_rec.back
     where id = v_rec.product_id
       and stock is not null;
  end loop;

  update public.commerce_orders
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('inventory_restored', true)
   where id = _order;
end;
$function$;

-- service_role only, exactly like the decrement it inverses. This is a SECURITY DEFINER function
-- that moves inventory: the grant is the only lock, so both roles are named explicitly (a
-- `revoke ... from public` alone leaves Supabase's per-role default grants standing, ADR-959).
revoke execute on function public.restore_commerce_stock_atomic(uuid) from public, anon, authenticated;
grant execute on function public.restore_commerce_stock_atomic(uuid) to service_role;

comment on function public.restore_commerce_stock_atomic(uuid) is
  'Atomic per-order stock RESTORE for fully refunded commerce orders; the inverse of decrement_commerce_stock_atomic. Increments the VARIANT stock for variant-selected items, else the PRODUCT stock; skips untracked (null) rows; no-ops unless metadata.inventory_decremented; idempotent via metadata.inventory_restored under a for-update lock on the order. Increments and marker commit in ONE transaction, replacing the app-side compare-and-swap loop that could exhaust its retries. service_role only. LIVE-161.';
