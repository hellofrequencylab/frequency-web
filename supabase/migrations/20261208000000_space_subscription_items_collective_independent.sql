-- Community Collective go-live (ADR-811): admit the two new base item_keys `collective` and
-- `independent` into the space_subscription_items CHECK constraint so a Collective / Independent
-- subscription line reconciles instead of being silently dropped.
--
-- WHY THIS IS NEEDED: reconcileSpacePlanSubscription -> persistSpaceSubscriptionItems upserts one row
-- per Stripe subscription item. The Collective base maps to item_key = 'collective' and the Independent
-- base to 'independent' (lib/billing/space-subscription-items.ts itemKeyForCatalogKey, ADR-811). The
-- prior CHECK (20261192000000) did NOT list them, so the upsert would violate the constraint;
-- supabase-js returns `{ error }` (it does not throw) and the write path never inspects it, so the base
-- row would be lost with no signal — readLockedPriceId then returns null (no grandfather lock) and the
-- plan can't persist its founding price. This adds the two values so the rows are accepted.
--
-- SHIP NOTE: dormant until go-live. Everything stays behind `billing_live = OFF` AND the per-plan
-- switches (plan_collective_enabled / plan_independent_enabled); the loadout checkout for these tiers
-- cannot run until billing goes live, the switches are ON, and the collective_base / independent_base
-- catalog prices are synced to Stripe. Purely additive: it re-adds the same CHECK with the two keys
-- appended, so it never rejects an existing row. Apply only after 20261192000000.

begin;

-- Re-add the item_key CHECK with `collective` + `independent` appended. The set mirrors code ITEM_KEYS
-- (lib/billing/space-subscription-items.ts): the Business base ('business') + the new Collective /
-- Independent bases + the former Pro base ('base', kept resolvable) + the AI add-on ('ai') + the
-- nonprofit seat + the RETIRED-but-resolvable legacy add-on keys (marketing/team/branding) + the real
-- per-seat operator seat ('operator_seat').
alter table public.space_subscription_items
  drop constraint if exists space_subscription_items_item_key_check;
alter table public.space_subscription_items
  add constraint space_subscription_items_item_key_check
  check (item_key in ('base', 'business', 'collective', 'independent', 'ai', 'nonprofit_seat', 'marketing', 'team', 'branding', 'operator_seat'));

commit;
