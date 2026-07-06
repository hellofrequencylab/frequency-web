-- Phase 2 of the business-model collapse (ADR-552, docs/BUSINESS-MODEL-PLAN.md §4):
-- collapse the space PLAN model to `free · business · nonprofit`, where free-vs-paid is a
-- USAGE STATE within Business, not a separate plan name. The retired plan/tier names
-- (pro/practitioner, organization, whitelabel) fold away in code (lib/pricing/plans.ts
-- LEGACY_PLAN_REMAP narrows old rows at read time; retired catalog/price keys stay resolvable
-- via lib/billing/pricing-keys.ts RETIRED_CATALOG_KEYS, never hard-deleted).
--
-- SHIP NOTE: FILE-ONLY (not yet applied). Everything stays behind `billing_live = OFF` — this
-- migration is dormant DB hygiene, not a go-live step. Apply only after confirming DB reality
-- (BUSINESS-MODEL-PLAN §0) and never before Phase 1 (20261015…) is applied.
--
-- `spaces.plan` is FREE TEXT with no CHECK, so no column migration is needed there: a legacy
-- label (`pro`/`practitioner`/`organization`/`whitelabel`) still reads correctly because
-- asSpacePlan() narrows it forward. Only the space_subscription_items.item_key CHECK carried
-- `organization` as an allowed value; this drops it (grandfathered rows still RESOLVE to a plan
-- via the code fallback, so the plan entitlement is never lost — only the audit-mirror item row
-- is retired). Written defensively: any stray `organization` item row is migrated first so the
-- tightened CHECK can never reject a live row at apply time.

begin;

-- 1. Retire any lingering `organization` subscription-item rows FIRST (dormant; billing OFF, so
--    there should be none). Fold them onto the nonprofit seat item so the tightened CHECK holds
--    and a grandfathered row still narrows to the nonprofit plan (planForItemKeys). This is
--    defensive: on a clean DB it updates zero rows.
update public.space_subscription_items
   set item_key = 'nonprofit_seat'
 where item_key = 'organization';

-- 2. Drop and re-add the item_key CHECK WITHOUT `organization`. The set mirrors code ITEM_KEYS
--    (lib/billing/space-subscription-items.ts) minus organization: the Business base ('business')
--    + the former Pro base ('base', kept resolvable) + the AI add-on ('ai') + the nonprofit seat
--    + the RETIRED-but-resolvable legacy add-on keys (marketing/team/branding).
alter table public.space_subscription_items
  drop constraint if exists space_subscription_items_item_key_check;
alter table public.space_subscription_items
  add constraint space_subscription_items_item_key_check
  check (item_key in ('base', 'business', 'ai', 'nonprofit_seat', 'marketing', 'team', 'branding'));

-- 3. Data hygiene (dormant config; safe no-ops while billing is OFF): retire the per-plan enable
--    flags + price settings for the collapsed tiers. The code no longer reads these keys
--    (PRICING_FLAG_KEYS / SETTING_DEFAULTS dropped them, ADR-552); removing the rows keeps the
--    tables tidy. FAIL-SAFE: absent rows delete nothing.
delete from public.platform_flags
 where key in ('plan_practitioner_enabled', 'plan_organization_enabled', 'plan_whitelabel_enabled');

delete from public.pricing_settings
 where key in ('plan.practitioner', 'plan.organization', 'plan.whitelabel');

commit;
