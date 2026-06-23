-- =============================================================================
-- Round-2 concurrency guards (QA pass 3). Decision: docs/DECISIONS.md ADR-371.
--
-- THREE additive, idempotent, race-safe DB guarantees. Each closes a check-then-act
-- window that the app cannot close on its own (the admin client issues two separate
-- statements, so two concurrent calls both pass the app-side pre-check and overspend /
-- overbook). All app-side pre-checks stay as fast-fail UX; THESE are the source of truth.
--
--   E1. Gift / redeem overspend. giftGems (lib/rewards/gifts.ts) and redeemItem
--       (app/(main)/crew/store/actions.ts) read a DERIVED spendable balance
--       (lifetime_gems - SUM(store_redemptions.gems_spent) - SUM(gem_gifts.amount as
--       giver)) and then insert, with no atomic guard. Two concurrent spends both pass.
--       Fix: two SECURITY DEFINER RPCs that take pg_advisory_xact_lock on the spender's
--       profile, recompute the spendable balance INSIDE the same transaction, and insert
--       the gem_gift / store_redemption ONLY if balance >= amount, else raise a typed
--       'insufficient_balance' error. The app calls these instead of check-then-insert.
--       Side effects unchanged: the recipient credit ('gift_received' via awardGems), the
--       store stock decrement (the existing after_store_redemption trigger still fires on
--       the insert), and the streak-freeze slug special-case all stay in app code.
--
--   F2. Circle membership overbooking. joinCircle (app/(main)/circles/actions.ts) does a
--       capacity check-then-insert with NO DB enforcement (only a member_count bump via
--       the existing trg_increment_circle_member_count). Fix: a BEFORE INSERT trigger on
--       `memberships` that locks the circle row, counts active members, and RAISES if the
--       insert would exceed circles.member_cap. Mirrors the event RSVP capacity guard
--       (enforce_event_rsvp_capacity, 20260610030000), but RAISES rather than coerces
--       (a circle has no waitlist). The app keeps its pre-check as fast-fail UX.
--
-- House style (matches 20260714010000): additive + idempotent (CREATE OR REPLACE
-- FUNCTION, DROP TRIGGER IF EXISTS then CREATE TRIGGER), SECURITY DEFINER with a pinned
-- search_path. SAFE to re-run. No em or en dashes.
--
-- ROLLBACK:
--   drop trigger if exists trg_enforce_circle_member_cap on public.memberships;
--   drop function if exists public.enforce_circle_member_cap();
--   drop function if exists public.gift_gems_atomic(uuid, uuid, integer);
--   drop function if exists public.redeem_store_item_atomic(uuid, uuid, integer);
-- =============================================================================

-- ============================================================================================
-- E1a. gift_gems_atomic: atomic spendable-balance check + gem_gifts insert under an advisory
--      lock on the giver. Returns the new gem_gifts row id. Raises 'insufficient_balance'
--      (a typed SQLSTATE 'P0001' message the app maps to a clean failure) when the giver
--      cannot cover the gift. The recipient credit ('gift_received') stays in app code so the
--      live gem_config amount + ledger semantics are unchanged.
-- ============================================================================================
create or replace function public.gift_gems_atomic(
  _giver     uuid,
  _recipient uuid,
  _amount    integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spendable integer;
  v_gift_id   uuid;
begin
  if _amount is null or _amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  -- Serialize every spend by this giver: concurrent gift/redeem calls for the same profile
  -- block here until the holder commits, so the balance recompute below sees their write.
  perform pg_advisory_xact_lock(hashtextextended(_giver::text, 0));

  -- Recompute spendable INSIDE the locked transaction (the same model as lib/store/balance):
  -- lifetime_gems - store spend - gifts already sent. Never negative.
  select greatest(
    0,
    coalesce((select lifetime_gems from public.profiles where id = _giver), 0)
    - coalesce((select sum(gems_spent) from public.store_redemptions where profile_id = _giver), 0)
    - coalesce((select sum(amount)     from public.gem_gifts        where giver_id   = _giver), 0)
  ) into v_spendable;

  if v_spendable < _amount then
    raise exception 'insufficient_balance' using errcode = 'P0001';
  end if;

  insert into public.gem_gifts (giver_id, recipient_id, amount)
  values (_giver, _recipient, _amount)
  returning id into v_gift_id;

  return v_gift_id;
end;
$$;

-- ============================================================================================
-- E1b. redeem_store_item_atomic: atomic spendable-balance check + capped-stock recheck +
--      store_redemptions insert under an advisory lock on the buyer. Returns the redemption
--      row id. Raises 'insufficient_balance' or 'out_of_stock' (typed P0001) on failure.
--      The after_store_redemption trigger still fires on the insert (it decrements
--      store_items.stock for capped SKUs), so stock handling is unchanged. All the other
--      app-side guards (entitlement, season/rank/expiry, already-owned, streak-freeze
--      pre-check, fulfillment routing) stay in the action and run BEFORE this call.
-- ============================================================================================
create or replace function public.redeem_store_item_atomic(
  _profile uuid,
  _item    uuid,
  _cost    integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spendable    integer;
  v_stock        integer;
  v_sold         integer;
  v_redemption_id uuid;
begin
  if _cost is null or _cost < 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_profile::text, 0));

  -- Capped SKUs: recheck COUNT(redemptions) against the item's current stock INSIDE the lock
  -- (the existing app check is the same comparison; doing it here makes it race-safe). The
  -- after_store_redemption trigger decrements stock on insert, so this mirrors live behavior.
  select stock into v_stock from public.store_items where id = _item;
  if v_stock is not null then
    select count(*) into v_sold from public.store_redemptions where item_id = _item;
    if v_sold >= v_stock then
      raise exception 'out_of_stock' using errcode = 'P0001';
    end if;
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
$$;

-- The RPCs run as SECURITY DEFINER and are only called from already-authorized server
-- actions (the caller is established + validated before the call). Lock them to the
-- service role; revoke the default PUBLIC execute so a session role cannot call them.
revoke all on function public.gift_gems_atomic(uuid, uuid, integer) from public;
revoke all on function public.redeem_store_item_atomic(uuid, uuid, integer) from public;
grant execute on function public.gift_gems_atomic(uuid, uuid, integer) to service_role;
grant execute on function public.redeem_store_item_atomic(uuid, uuid, integer) to service_role;

-- ============================================================================================
-- F2. enforce_circle_member_cap: BEFORE INSERT trigger on memberships. Lock the circle row
--     (FOR UPDATE serializes concurrent joins on the same circle), count active members, and
--     RAISE if this insert would exceed circles.member_cap. Mirrors the event RSVP capacity
--     guard's locking posture (20260610030000) but raises (a circle has no waitlist). Only
--     'active' memberships consume a seat (matches the app pre-check + member_count semantics).
-- ============================================================================================
create or replace function public.enforce_circle_member_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap    integer;
  v_active integer;
begin
  -- Only an active membership consumes a seat.
  if NEW.status is distinct from 'active' then
    return NEW;
  end if;

  -- Lock the circle row so concurrent joins serialize on it (race-safe count).
  select member_cap into v_cap
    from public.circles
   where id = NEW.circle_id
   for update;

  -- No circle / no cap configured: nothing to enforce.
  if v_cap is null then
    return NEW;
  end if;

  select count(*) into v_active
    from public.memberships
   where circle_id = NEW.circle_id
     and status = 'active'
     and id <> NEW.id;

  if v_active >= v_cap then
    raise exception 'circle_full' using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_circle_member_cap on public.memberships;
create trigger trg_enforce_circle_member_cap
  before insert on public.memberships
  for each row execute function public.enforce_circle_member_cap();
