-- `store_items.stock` meant two different things, and the two readings multiplied: a capped SKU
-- could only ever sell CEIL(N/2) of its N units.
--
--   trigger after_store_redemption (20260614210000:30)   stock = GREATEST(0, stock - 1)  REMAINING
--   store-grid.tsx:46,122   outOfStock = stock <= 0; "{stock} remaining"                 REMAINING
--   crew/store/actions.ts:102-108   sold >= item.stock                                   TOTAL
--   redeem_store_item_atomic (this function)   v_sold >= v_stock                          TOTAL
--
-- With both mechanisms live, sale k is permitted iff (k-1) < (N+1-k), i.e. k <= ceil(N/2).
-- listening-room-seat is seeded stock = 12:
--
--   sale 1: sold=0, stock=12 -> allowed, stock -> 11
--   sale 6: sold=5, stock=7  -> allowed, stock -> 6
--   sale 7: sold=6, stock=6  -> 6 >= 6 -> "Out of stock", permanently
--
-- Six of the twelve seats were unsellable, and at the moment of refusal the card beside the
-- disabled button read "6 remaining".
--
-- RESOLVED TOWARDS REMAINING, for three reasons: the trigger that MAINTAINS the column already
-- treats it that way, the UI already renders it that way, and -- decisively -- the values
-- currently stored have already been decremented by past redemptions, so they ARE remaining.
-- Redefining the column as a total would silently misread live data on every capped SKU.
--
-- This function is the live path (crew/store/actions.ts:169). Its own comment said the check
-- "mirrors live behavior" while naming the decrementing trigger one line above -- it mirrored the
-- defect rather than the intent, which is why the count-based check is removed rather than tuned.
-- The advisory lock plus the stock read inside it still make this the atomic gate.

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

  perform pg_advisory_xact_lock(hashtextextended(_profile::text, 0));

  -- Capped SKUs: `stock` is REMAINING and the after_store_redemption trigger decrements it on
  -- insert, so the whole check is "is there one left". Counting redemptions here and comparing
  -- against a column that is itself decremented per redemption double-counted every sale.
  select stock into v_stock from public.store_items where id = _item;
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
