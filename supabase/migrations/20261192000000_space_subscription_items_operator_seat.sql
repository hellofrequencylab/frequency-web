-- Operator seats (ADR-799): admit the real per-seat item_key `operator_seat` into the
-- space_subscription_items CHECK constraint so a paid seat line reconciles instead of being
-- silently dropped.
--
-- WHY THIS IS NEEDED: reconcileSpacePlanSubscription -> persistSpaceSubscriptionItems upserts one
-- row per Stripe subscription item. The operator-seat item maps to item_key = 'operator_seat'
-- (lib/billing/space-subscription-items.ts itemKeyForCatalogKey). The prior CHECK
-- (20261016000000) did NOT list it, so the upsert violated the constraint; supabase-js returns
-- `{ error }` (it does not throw) and the write path never inspects it, so the seat row was lost
-- with no signal — readLockedPriceId then returned null (no grandfather lock) and the licensed
-- seat count could not persist. This adds the value so the row is accepted.
--
-- SHIP NOTE: FILE-ONLY, dormant. Everything stays behind `billing_live = OFF`; operator-seat
-- checkout cannot run until billing goes live AND the owner sets the real seat price (the catalog
-- item is a skipped PLACEHOLDER, lib/billing/pricing-keys.ts / pricing-products.ts). Apply only
-- after the collapse migration (20261016000000) is applied. Purely additive: it re-adds the same
-- CHECK with `operator_seat` appended, so it never rejects an existing row.

begin;

-- Re-add the item_key CHECK with `operator_seat` appended. The set mirrors code ITEM_KEYS
-- (lib/billing/space-subscription-items.ts): the Business base ('business') + the former Pro base
-- ('base', kept resolvable) + the AI add-on ('ai') + the nonprofit seat + the RETIRED-but-resolvable
-- legacy add-on keys (marketing/team/branding) + the real per-seat operator seat ('operator_seat').
alter table public.space_subscription_items
  drop constraint if exists space_subscription_items_item_key_check;
alter table public.space_subscription_items
  add constraint space_subscription_items_item_key_check
  check (item_key in ('base', 'business', 'ai', 'nonprofit_seat', 'marketing', 'team', 'branding', 'operator_seat'));

commit;
