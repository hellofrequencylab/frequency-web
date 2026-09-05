-- A limited-stock Vault SKU could be OVERSOLD, and the overshoot left no trace.
--
-- `redeem_store_item_atomic` is the live redemption path (crew/store/actions.ts). Its guard is:
--
--     perform pg_advisory_xact_lock(hashtextextended(_profile::text, 0));   -- locks the BUYER
--     select stock into v_stock from public.store_items where id = _item;   -- no row lock
--     if v_stock is not null and v_stock <= 0 then raise 'out_of_stock';
--
-- The advisory lock is keyed on the BUYER. The contended resource is the ITEM. Two different
-- profiles redeeming the last unit of one SKU therefore take two DIFFERENT locks and never
-- exclude each other: both read `stock = 1`, both pass the check, both insert, and the
-- after_store_redemption trigger decrements twice. Two units sell where one existed.
--
-- The overshoot is then INVISIBLE, because that trigger clamps: `stock = GREATEST(0, stock - 1)`.
-- The column floors at 0 rather than going negative, so nothing in the data records that the SKU
-- went past its cap. The only evidence is store_redemptions holding more rows than the item ever
-- had units, which nothing compares.
--
-- The buyer-keyed lock is not wrong, it is INCOMPLETE. It correctly serialises one profile
-- against itself, which is what protects the balance arithmetic below (lifetime_gems minus
-- spends minus gifts) from a double-spend by one member clicking twice. It was simply never the
-- lock that protects stock. This migration keeps it and adds the missing one.
--
-- SAME SHAPE THIS REPO HAS FIXED TWICE BEFORE on other resources: SCAN-559 and SCAN-565. The
-- lesson each time was to ask which ROW is contended, not whether there is a lock.
--
-- THE FIX: read the item row `FOR UPDATE`. That takes a row-level lock held to the end of the
-- transaction, so a second redemption of the same SKU blocks until the first commits and then
-- reads the DECREMENTED stock. No deadlock risk: each transaction takes only its own profile's
-- advisory lock (never another's), and the item lock is a single resource acquired after it in a
-- consistent order.
--
-- Everything else is byte-identical to 20270221000300, including the "stock is REMAINING"
-- resolution that migration established and the exact error codes the caller maps.

create or replace function public.redeem_store_item_atomic(_profile uuid, _item uuid, _cost integer)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_spendable    integer;
  v_stock        integer;
  v_redemption_id uuid;
begin
  if _cost is null or _cost < 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  -- Serialises one BUYER against themselves, so the balance check below cannot be raced by the
  -- same member submitting twice. This does NOT protect stock: two buyers hash to two keys.
  perform pg_advisory_xact_lock(hashtextextended(_profile::text, 0));

  -- Serialises every buyer against each other FOR THIS ITEM. `for update` holds a row lock until
  -- commit, so a concurrent redemption of the same SKU waits here and then reads the stock the
  -- first one already decremented, instead of both reading the same pre-sale value.
  --
  -- Capped SKUs: `stock` is REMAINING and after_store_redemption decrements it on insert, so the
  -- whole check is "is there one left" (20270221000300). An uncapped SKU has stock null and the
  -- lock is a no-op row read.
  select stock into v_stock from public.store_items where id = _item for update;
  if v_stock is not null and v_stock <= 0 then
    raise exception 'out_of_stock' using errcode = 'P0001';
  end if;

  select greatest(
    0,
    coalesce((select lifetime_gems from public.profiles where id = _profile), 0)
    - coalesce((select sum(gems_spent) from public.store_redemptions where profile_id = _profile), 0)
    - coalesce((select sum(amount)     from public.gem_gifts        where giver_id   = _profile), 0)
  ) into v_spendable;

  if v_spendable < _cost then
    raise exception 'insufficient_balance' using errcode = 'P0001';
  end if;

  insert into public.store_redemptions (profile_id, item_id, gems_spent)
  values (_profile, _item, _cost)
  returning id into v_redemption_id;

  return v_redemption_id;
end;
$function$;
