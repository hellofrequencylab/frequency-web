-- Deactivate the gem-store membership BILLING-CREDIT SKUs until they can be honored.
--
-- `membership-1mo` / `membership-3mo` (metadata {type:'membership', months:N}) imply an
-- automatic paid-membership grant. `redeemItem()` only ever applied border/flair/title
-- cosmetic effects, so redeeming one would deduct Gems and grant nothing — a silent loss
-- (0 redemptions in prod at the time of this fix, so no member was charged). A real grant
-- is a paid-tier credit that needs the Stripe billing-credit rail (OPEN-THREADS A3); we do
-- not have it yet, so the honest state is "not on the shelf".
--
-- `redeemItem()` also refuses these defensively (ADR-280) in case an operator reactivates
-- them. Reactivate (is_active = true) ONLY once the billing-credit fulfillment path exists.
-- Idempotent.

update public.store_items
set is_active = false
where slug in ('membership-1mo', 'membership-3mo');
