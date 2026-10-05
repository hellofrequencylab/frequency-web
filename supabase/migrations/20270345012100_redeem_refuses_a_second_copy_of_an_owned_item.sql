-- =============================================================================
-- A cosmetic, title or collectible can be bought TWICE by two concurrent submits (SCAN-695).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- THE RACE. The already-own check for a non-stackable item lives in the store action, an app-side
-- read of store_redemptions BEFORE the RPC. redeem_store_item_atomic (20270345001100) takes the
-- buyer's advisory lock and the item row lock, then rechecks only stock and balance before the
-- insert; it never asks whether this buyer already holds the item, and store_redemptions carries
-- no unique on (profile_id, item_id). Two submits from two tabs both pass the pre-check, both
-- enter the RPC in turn, and both insert: the member pays twice for one border. Once two rows
-- exist, the pre-check's maybeSingle returned the multiple-rows error with data null, so every
-- later purchase passed the check as well.
--
-- THE FIX, inside the lock. The buyer advisory lock already serialises one profile against
-- itself, so an ownership check taken AFTER it is race-free: the second submit waits for the
-- first to commit, then sees its row. The function now also reads the item's category and, for
-- cosmetic, title and collectible items, raises already_owned (P0001) when a store_redemptions
-- row for this profile and item exists. The action maps already_owned to "You already own this
-- item", the same sentence its pre-check uses. A grant (lib/awards/cosmetics.ts, gems_spent 0)
-- is a store_redemptions row too, so a granted cosmetic cannot be bought on top of the grant.
--
-- NOT A PARTIAL UNIQUE INDEX: category lives on store_items, not on the redemption row, and any
-- duplicate pair already written would break the index build.
--
-- A stackable item (a perk, a streak freeze, anything else) is untouched. Everything else is
-- byte-identical to 20270345001100, including the lock order (buyer, then item) and the exact
-- error codes the caller maps. Grants are preserved by create or replace: service_role only,
-- as 20260728000000 set them.
--
-- ROLLBACK: re-run the function body from 20270345001100_redeem_locks_the_item_not_the_buyer.sql.
-- =============================================================================

create or replace function public.redeem_store_item_atomic(_profile uuid, _item uuid, _cost integer)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_spendable    integer;
  v_stock        integer;
  v_category     text;
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
  select stock, category into v_stock, v_category from public.store_items where id = _item for update;
  if v_stock is not null and v_stock <= 0 then
    raise exception 'out_of_stock' using errcode = 'P0001';
  end if;

  -- A non-stackable item is owned once. Checked under the buyer's advisory lock, so a second
  -- submit from the same member sees the first one's row (SCAN-695).
  if v_category in ('cosmetic', 'title', 'collectible') and exists (
    select 1 from public.store_redemptions where profile_id = _profile and item_id = _item
  ) then
    raise exception 'already_owned' using errcode = 'P0001';
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
