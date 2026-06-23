# Pricing & entitlements

> **Status:** ✅ P1 shipped (the entitlements + admin-config foundation). ✅ P2 shipped (Stripe
> products/prices + subscription checkout + the webhook → entitlements, founder lock honored). ⏳
> P3 = wire the gates into live surfaces. **EVERYTHING STILL SHIPS OFF: no charge happens and no
> live Stripe call fires unless an operator has set env keys AND flipped `billing_live` + the
> per-tier switch.** The master `billing_live` switch is OFF by default, so members and spaces keep
> their current access exactly as today.
>
> **Decision:** [ADR-362](DECISIONS.md) (P1) · [ADR-363](DECISIONS.md) (P2). **Authoritative model:**
> the owner's "Frequency — Pricing Model & Feature Gating Spec." **Source of truth (code):**
> `lib/pricing/*`, `lib/billing/*`, the `/admin/pricing` console, and
> `supabase/migrations/20260723010000_pricing_foundation.sql` + `20260723020000_pricing_stripe.sql`.

## TL;DR

Frequency monetizes on **three independent flags**. The whole pricing system is built so that
each one moves on its own axis and is operator-editable from `/admin/pricing` — and so that turning
billing OFF leaves the product behaving exactly as it does today.

| Flag | What it means | Where it lives | Set by |
|---|---|---|---|
| **billing_tier** | What someone PAYS for | personal: `profiles.membership_tier` (`free`/`crew`/`supporter`) · space: `spaces.plan` (`free`/`practitioner`/`business`/`organization`/`whitelabel`) | billing (P2) / operator |
| **community_role** | EARNED standing | `community_role` ladder | earned, **never** billing (ADR-207) |
| **gamification_access** | Full game vs earn only | derived from `billing_tier`, overridable via `profiles.gamification_access_override` | derive **or** operator |

We **reuse** the existing entitlement seams — `lib/core/entitlement.ts` (`isPaid`, `canCashIn`,
`deriveTier`) for the personal tier, and `spaces.plan` + `spaces.entitlements` +
`spaceHasEntitlement` (default-deny) for the space plan. P1 adds **no new tier column**; it adds the
founder/override bits, the operator-config tables, and the admin console.

## The three-flag model

### 1. billing_tier (what you pay for)

- **Personal:** `profiles.membership_tier` IS the personal billing tier (free → crew → supporter).
  Unchanged. `lib/core/entitlement.ts` stays the single seam.
- **Space:** `spaces.plan` IS the space billing plan. `lib/pricing/plans.ts` gives the labels a typed
  home (`SPACE_PLANS`) and the default **plan → entitlement-keys** map (`planEntitlements`). The P2
  webhook will call `setSpacePlan(spaceId, plan)` (`lib/pricing/space-plan.ts`) to write the plan and
  **expand** `spaces.entitlements` to the keys the plan unlocks — the same `{ key: true }` blob
  `spaceHasEntitlement` already reads, **additively** (manual grants survive). `setSpacePlan` is gated
  on `billingLive()`, so it is a no-op while billing is OFF.

### 2. community_role (earned, never billing)

The trust ladder (`community_role`, ADR-207) is untouched and decoupled from billing. A free-tier
Host gets their tools from the role via the access matrix, not from membership.

### 3. gamification_access (derived, but overridable)

The **third flag**, the one most often confused with billing. By default it is derived from the
billing tier (member = `earn_only`, crew+ = `full`, the same line `canCashIn` draws). But it is an
**independent, overridable switch**: `profiles.gamification_access_override` (nullable; `null` =
derive) PINS it regardless of billing — so an operator can comp a free member the full game, or hold
a paying member to earn-only. Resolved by `resolveGamificationAccess(profile)` =
`override ?? derive(membership_tier)` (`lib/pricing/gamification.ts`, pure + unit-tested).

## Seeded launch values (all editable, all OFF)

Seeded by the migration and mirrored in code (`PRICING_DEFAULTS` in `lib/pricing/settings.ts`). Every
value is editable at `/admin/pricing`; nothing charges while `billing_live` is OFF.

| Plan | Monthly | Annual (≈ 2 months free) | Notes |
|---|---|---|---|
| Crew (member) | $9 | $90 | personal tier |
| Supporter (member) | $24 | $240 | personal tier |
| Practitioner (space) | $39 | $390 | take-rate 8% |
| Business (space) | $99 | $990 | take-rate 5% |
| Organization (space) | $199 | monthly only | take-rate 3% |
| White-label (space) | $299 + $2,000 setup | monthly only | branding removal |

Other knobs: **Vera free cap** 10 messages/day · **annual discount** ≈ 2 months free · **trial** 0
days (editable). Take-rates are stored in basis points (800 = 8%).

## Feature gates (data, not code branches)

The feature → minimum-entitlement map is **data**. The code map in `lib/pricing/gates.ts`
(`FEATURE_GATES`) is the source of truth; the `pricing_feature_gates` table is an additive,
FAIL-SAFE **override layer** merged OVER it, exactly the way `lib/layout/page-chrome.ts` merges
operator chrome overrides over code defaults (`mergeGate` mirrors `mergeChrome`).

`featureAllowed(feature, account, { billingLive })` is the single resolver. Seeded features:

| Feature | Axis | Needs |
|---|---|---|
| `vault_cash_in` | tier | crew |
| `gamification_full` | tier | crew |
| `vera_unlimited` | tier | crew |
| `space_crm` | plan | practitioner |
| `space_email` / `space_automation` / `space_team` / `space_multi_pipeline` | plan | business |
| `space_whitelabel` | plan | whitelabel |

## How OFF preserves current behavior 🔴 important

`billing_live` defaults OFF, and the live gate is `billingLive()` = `billingEnabled()` (the Stripe
env keys) **AND** the `billing_live` flag — so billing is OFF even with env keys present until an
operator flips the master switch. While OFF:

- `featureAllowed(...)` **short-circuits to `true`** (grant everything). No surface that consults it
  changes behavior.
- `setSpacePlan(...)` is a **no-op** (returns `billing_off`), so no Space's entitlements change.
- Per-tier/plan `*_enabled` switches are all OFF; the gamification toggles mirror the existing
  derive-from-tier default (crew/supporter full, member earn-only).

Every reader is additionally FAIL-SAFE: a DB error or the pre-migration state falls back to the
seeded code defaults, never to a charge or a lockout.

## P2 — Stripe products/prices + subscriptions (ADR-363)

P2 wires Stripe behind the same gate, so the whole layer still ships OFF. Nothing here charges or
makes a live Stripe call unless `billingEnabled()` (env keys present) AND `billing_live` AND the
per-tier/plan switch are all on. Migration: `20260723020000_pricing_stripe.sql`.

**Stripe product/price catalog.** `lib/billing/pricing-products.ts` `syncPricingProductsToStripe()`
creates/updates one Stripe **Product per tier** (Crew, Supporter, Practitioner, Business,
Organization, White-label) and a **monthly + annual Price** from the admin `pricing_settings` values,
writing the resolved ids into `pricing_stripe_prices` (`key` → `stripe_product_id` / `stripe_price_id`
/ `archived`). It is **admin-triggered only** (the `/admin/pricing` "Sync products to Stripe" action),
**never** on import/boot, and a clear no-op when env is missing. Idempotent: Products are looked up by
a stable metadata key (`frequency_pricing_key`); Prices (immutable in Stripe) are reused when amount +
interval match, else a new Price is created. Founder prices are separate Price objects stored
`archived=true` (not public, referenced by `locked_price_id`). Keys: `crew_monthly`, `crew_annual`,
`supporter_monthly`/`_annual`, `practitioner_monthly`/`_annual`, `business_monthly`/`_annual`,
`organization_monthly`, `whitelabel_monthly`, plus the `*_founder` variants for the member tiers.

**Subscription checkout (all gated, return null when OFF).**

| Function | What | Gate |
|---|---|---|
| `createMembershipCheckout` (extended) | member Crew/Supporter subscription; **honors the founder lock** (`locked_price_id` → founder Price → public Price → env fallback) | `billingEnabled` (existing path); founder lock applied at price resolution |
| `createSpacePlanCheckout(spaceId, plan, period)` | Space owner buys a plan; customer = the space owner; metadata `{ kind:'space_plan', space_id, plan }` | `billingLive()` AND `plan_*_enabled` |
| `createSpaceMembershipCheckout(spaceId, tierId, memberId)` | member joins a paid space tier; **Connect destination charge**, application fee = the SPACE plan's take-rate (8/5/3% from `pricing_settings`); metadata `{ kind:'space_membership', space_id, tier_id, member_id }` | `billingLive()` + owner Connect-ready |

The pure price-key, take-rate, and founder-lock math lives in `lib/billing/pricing-keys.ts`
(`priceKey`, `takeRateCents`, `memberCheckoutPriceKey`); the take-rate IO wrapper is
`lib/billing/fees.ts` `spaceTakeRateCents` (reads `pricing_settings.take_rate`, fail-safe). Management
reuses `createBillingPortal`.

**Webhook → entitlements (idempotent, by `metadata.kind`).** The existing membership webhook
(`app/api/stripe/webhook/route.ts`) now routes subscription events through
`lib/billing/space-subscriptions.ts` FIRST:

- `kind:'space_plan'` (`created`/`updated`/`deleted`) → `setSpacePlan(space_id, plan|free)` (active →
  the plan, canceled → free) + persist `spaces.stripe_subscription_id` / `stripe_customer_id`.
- `kind:'space_membership'` → upsert `space_memberships.stripe_subscription_id` + `payment_status`
  (`active`/`past_due`/`canceled`).
- No `kind` → the member Crew/Supporter path runs unchanged.

Idempotency is the existing `stripe_webhook_events` claim plus fixed-value writes keyed by id.
**No live Stripe call happens during `pnpm test`/`pnpm build`** — every Stripe call sits behind
`billingEnabled()`/`billingLive()` and is invoked only at runtime; the pure logic is unit-tested with
the client never touched (`lib/billing/pricing-keys.test.ts`, `space-subscriptions.test.ts`).

## The /admin/pricing console

A janitor-gated operator surface (`app/(main)/admin/pricing/`, registered in
`app/(main)/admin/sections.ts` and `lib/admin/nav.ts` under Operations → Platform). Composes the
admin page kit (`AdminTemplate` + `FormSection` + `Toggle`). Routes:

| Route | What |
|---|---|
| `/admin/pricing` | the whole console |

Sections: **Switches** (master `billing_live`, prominent + OFF; per-tier/plan enable; per-role
gamification) · **Plans and prices** (every value, in dollars) · **Feature gates** (the editable
feature → entitlement matrix with a per-feature enable toggle) · **Founding members** (the founder
lock + locked-price reference, honored at checkout) · **Stripe products** (P2: status, the
env-gated "Sync products to Stripe" action, and the resolved `pricing_stripe_prices` map; the sync
button is disabled until the Stripe env keys are set). All writes are admin-gated server actions
(`actions.ts`) that audit flag flips via `setPlatformFlag` → `platform_flag_events`.

## Files

| Concern | File |
|---|---|
| Migrations | `supabase/migrations/20260723010000_pricing_foundation.sql` (P1) · `20260723020000_pricing_stripe.sql` (P2) |
| Space plans + plan→entitlements | `lib/pricing/plans.ts` |
| Gamification resolver (flag 3) | `lib/pricing/gamification.ts` |
| Feature gates (code map + DB merge + `featureAllowed`) | `lib/pricing/gates.ts` |
| Settings, flags, `billingLive()` | `lib/pricing/settings.ts` |
| `setSpacePlan` (the webhook entry) | `lib/pricing/space-plan.ts` |
| Price keys + take-rate + founder-lock math (pure) | `lib/billing/pricing-keys.ts` |
| Stripe product/price sync (admin-triggered) | `lib/billing/pricing-products.ts` |
| Resolved Stripe price map (IO) | `lib/billing/pricing-prices.ts` |
| Space plan / membership checkout | `lib/billing/space-plan-checkout.ts` · `lib/billing/space-membership-checkout.ts` |
| Webhook → entitlements (by `metadata.kind`) | `lib/billing/space-subscriptions.ts` · `app/api/stripe/webhook/route.ts` |
| Take-rate IO wrapper | `lib/billing/fees.ts` (`spaceTakeRateCents`) |
| Admin console | `app/(main)/admin/pricing/` |
| Tests | `lib/pricing/pricing.test.ts` · `lib/billing/pricing-keys.test.ts` · `lib/billing/space-subscriptions.test.ts` |

## Roadmap

| Phase | Scope |
|---|---|
| ✅ **P1** | entitlements layer + operator config + `/admin/pricing` console; everything OFF |
| ✅ **P2** | Stripe wiring: product/price sync, subscription checkout for tiers/plans/space-memberships, the webhook calls `setSpacePlan`, founder lock honored at checkout; still ships OFF |
| ⏳ **P3** | wire `featureAllowed` / `resolveGamificationAccess` into live gated surfaces once billing is on |

## References

- Decision: [ADR-362](DECISIONS.md) · Authoritative spec: the owner's pricing & feature-gating spec
- Reused seams: `lib/core/entitlement.ts` · `lib/spaces/entitlements.ts` ·
  [ROLES.md](ROLES.md) (the role/entitlement axes) · [SPACES.md](SPACES.md) (tenancy)
- Billing env gate: `lib/billing/stripe.ts` (`billingEnabled`) · operator flags: `lib/platform-flags.ts`
