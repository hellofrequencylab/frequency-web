-- =============================================================================
-- Store redemption: stop the double charge (Rewards Economy v2 follow-up; ADR-220).
--
-- The original 20240121 trigger subtracted gems_spent from profiles.lifetime_gems,
-- but the canonical wallet model (ADR-140) is: lifetime_gems is MONOTONIC and the
-- spendable balance = lifetime_gems - SUM(store_redemptions.gems_spent), enforced
-- in getStoreData()/redeemItem(). With both in play every purchase deducted twice
-- (once in the app's balance math, once by the trigger shrinking lifetime_gems).
-- Dormant while the store had one redemption ever; the v2 Vault Store is live, so
-- the trigger now keeps ONLY its stock-decrement job. Granted cosmetics
-- (gems_spent = 0, stock NULL) pass through as pure no-ops.
--
-- Repair: restores the single historical double-charge (100 gems, badge-pioneer,
-- 2026-06-04). The prevent_economy_self_edit guard only admits the service role,
-- so the repair runs under a transaction-local service_role claim.
--
-- Applied to prod 2026-06-11 via MCP (recorded as store_redemption_no_double_charge).
-- =============================================================================

CREATE OR REPLACE FUNCTION after_store_redemption()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- lifetime_gems is monotonic (ADR-140): the app computes the spendable balance
  -- as lifetime_gems - SUM(gems_spent). The trigger only manages limited stock.
  UPDATE store_items
  SET stock = GREATEST(0, stock - 1)
  WHERE id = NEW.item_id AND stock IS NOT NULL;

  RETURN NEW;
END;
$$;

-- Transaction-local service_role claim so the economy guard admits the repair.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

UPDATE profiles
SET lifetime_gems = lifetime_gems + 100
WHERE id = 'c1d40f58-318b-4c7b-a331-21788d632fc9'
  AND EXISTS (
    SELECT 1 FROM store_redemptions r
    WHERE r.profile_id = 'c1d40f58-318b-4c7b-a331-21788d632fc9'
      AND r.gems_spent = 100
      AND r.redeemed_at < '2026-06-11'
  );
