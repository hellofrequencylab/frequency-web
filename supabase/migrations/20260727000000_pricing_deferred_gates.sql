-- Pricing deferred gates (docs/PRICING.md "Status & deferred", ADR-370; builds on ADR-362/363/364
-- and 20260723010000_pricing_foundation.sql + 20260723020000_pricing_stripe.sql). Adds the schema
-- the two schema-needing deferred items need:
--   * the Household / Circle multi-seat BUNDLE (REMAINING-WORK #6) — config + a member -> bundle link;
--   * member-facing DUNNING / past-due state (REMAINING-WORK #7) — a personal membership payment status.
--
-- EVERYTHING STILL SHIPS OFF (the ABSOLUTE INVARIANT, ADR-370). No charge happens and no live Stripe
-- call fires unless an operator has set env keys AND flipped `billing_live` + the per-tier switch. Every
-- column added here is INERT until a gated checkout/webhook writes it, and every reader is FAIL-SAFE:
--   * profiles.membership_payment_status defaults NULL, and the app reads NULL as 'active' (today's
--     behavior), so an unwritten column never shows a past-due banner or gates anyone.
--   * profiles.household_bundle_id defaults NULL (not in a bundle), so nothing changes for anyone.
--   * the bundle config + flag default OFF, so the bundle is never sold while billing is OFF.
--
-- House style (matches the prior pricing migrations): additive + idempotent, expand-only (nothing
-- dropped or made NOT NULL on an existing column), CREATE ... IF NOT EXISTS / INSERT ... ON CONFLICT
-- DO NOTHING, per-part header comment. RLS unchanged (the new columns ride existing tables; the seeded
-- rows go into the existing service-role / admin-gated pricing tables). Applied to production via the
-- Supabase SQL Editor (docs/WORKFLOW.md). lib/database.types.ts does not yet carry the new columns; the
-- readers reach them with untyped casts (ADR-246) and FAIL-SAFE to today's behavior until applied. The
-- types regen + the `as` cleanup it unblocks are tracked in ADR-370 (REMAINING-WORK #9). SAFE to re-run.
--
-- ROLLBACK (manual; this migration is never auto-reverted):
--   alter table public.profiles drop column if exists membership_payment_status;
--   alter table public.profiles drop column if exists household_bundle_id;
--   delete from public.pricing_settings where key = 'household_bundle';
--   delete from public.platform_flags where key = 'bundle_household_enabled';

-- ── 1. profiles.membership_payment_status: the personal-membership dunning state ───────────────────
-- The member Crew/Supporter subscription has no payment-status column today (the webhook path in
-- app/api/stripe/webhook/route.ts just flips membership_tier). Dunning / past-due UX needs a state to
-- read. Nullable + NO default value other than NULL: the app treats NULL as 'active' (FAIL-SAFE — an
-- unwritten column is exactly today's behavior, no banner, no gate). Only the gated member webhook ever
-- advances it to 'past_due' / 'canceled'. CHECK keeps the vocabulary in lock-step with
-- space_memberships.payment_status (Pricing P2).
alter table public.profiles
  add column if not exists membership_payment_status text
    check (membership_payment_status in ('active', 'past_due', 'canceled'));
comment on column public.profiles.membership_payment_status is
  'Member Crew/Supporter subscription payment state for dunning UX (ADR-370): active|past_due|canceled. NULL = no paid subscription / not yet written, read as active (today''s behavior). Only ever advanced by the gated member billing webhook; inert while billing_live is OFF.';

-- ── 2. profiles.household_bundle_id: the multi-seat (Household / Circle) bundle link ───────────────
-- A Household / Circle bundle is one paid subscription that seats several members. The bundle OWNER
-- (the payer) holds the Stripe subscription; each seated member points at the owner''s profile via this
-- self-FK. NULL = not in a bundle (everyone today). The self-reference makes the membership a graph the
-- app can read both ways (owner -> seats by reverse lookup, seat -> owner by this column). on delete set
-- null so removing an owner simply unseats their members (never cascades a delete).
alter table public.profiles
  add column if not exists household_bundle_id uuid references public.profiles(id) on delete set null;
comment on column public.profiles.household_bundle_id is
  'Household / Circle multi-seat bundle link (ADR-370, REMAINING-WORK #6): the profile id of the bundle OWNER (payer) who seats this member. NULL = not in a bundle (everyone today). Set only by the gated bundle checkout/webhook; inert while billing_live is OFF.';

-- A helper index for the reverse lookup (an owner''s seated members). Partial: only bundle members carry
-- the column, so the index stays tiny. IF NOT EXISTS keeps it idempotent.
create index if not exists profiles_household_bundle_id_idx
  on public.profiles (household_bundle_id)
  where household_bundle_id is not null;

-- ── 3. pricing_settings: the Household / Circle bundle config (seats + prices) ─────────────────────
-- The bundle''s editable values: how many seats it includes and the monthly/annual price (cents). Lives
-- in the existing pricing_settings (key -> jsonb), seeded with launch-target values, all editable at
-- /admin/pricing. The Stripe Price for the bundle uses the pricing key convention 'household_monthly' /
-- 'household_annual' in pricing_stripe_prices (no new table). Inert while billing is OFF.
insert into public.pricing_settings (key, value) values
  -- 4 seats, $24/mo or $240/yr (~2 months free), the launch target. All editable at /admin/pricing.
  ('household_bundle', '{"seats": 4, "monthly_cents": 2400, "annual_cents": 24000, "tier": "crew"}'::jsonb)
on conflict (key) do nothing;

-- ── 4. platform_flags: the per-bundle enable switch ───────────────────────────────────────────────
-- bundle_household_enabled mirrors the per-tier/plan *_enabled switches: must be ON, with billing live,
-- to SELL the bundle. Default OFF, so the bundle is never sellable while billing is OFF (the bundle sell
-- gate is billingLive() AND this flag, FAIL-SAFE FALSE).
insert into public.platform_flags (key, value) values
  ('bundle_household_enabled', false)
on conflict (key) do nothing;
