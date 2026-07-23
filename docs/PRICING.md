# Pricing & entitlements

> ## ⚠️ SUPERSEDED by the Community Collective model (ADR-811, July 2026). Read this first.
> The pricing direction is now the **Community Collective**: two-world pricing on `spaces.network_connected`
> (in-collective = affordable, standalone = standard SaaS), six named tiers (Member $0 · Crew $9 · Business
> $29 · Collective $79/beta $49 · Non Profit $39 · Independent ~$249), and a take-rate charged **only on
> network-sourced business** (0% on own bookings). Source of truth:
> [COMMUNITY-COLLECTIVE-STRATEGY.md](COMMUNITY-COLLECTIVE-STRATEGY.md) · plan:
> [COMMUNITY-COLLECTIVE-BUILD-PLAN.md](COMMUNITY-COLLECTIVE-BUILD-PLAN.md) · [ADR-811](DECISIONS.md).
> Ships behind `billing_live` OFF. The entitlement-partition / Stripe / grandfather plumbing below still
> applies; the plan shape + prices do not. Everything under here is historical.

> ## ⚠️ Prior model: FLAT pricing (ADR-590). Also historical.
>
> The live model is **flat, never per seat**: **Business $49/mo**, **Non Profit $29/mo flat** (everything in
> Business, donations built in, verified 501(c)(3)), the **Resonance Engine** add-on **+$20/mo** (optional on
> any paid plan), and a **flat 3% plus card processing** on every channel. Annual is two months free. **Crew**
> ($9/mo personal) is unchanged. Presented as five persona doors (coaches-and-healers · studios · event-hosts ·
> community-builders · nonprofits). Source of truth: `lib/billing/pricing-keys.ts` + `pricing_settings` +
> [ADR-590](DECISIONS.md); the flat-model summary + phase log is [PRICING-LADDER-PLAN.md](PRICING-LADDER-PLAN.md).
> **Ships behind `billing_live` OFF.** The 7-plan / per-seat / four-add-on material below is **historical** —
> the entitlement partition, Stripe catalog, webhook, and grandfather plumbing it describes still apply; the
> plan shape + prices do not.
>
> ⚠️ **Earlier note (ADR-458, itself now superseded by ADR-590).** The 7-plan model below was collapsed
> toward space plans + two member tiers with toggle add-ons; the full history is
> [PRICING-LADDER-PLAN.md](PRICING-LADDER-PLAN.md). **Everything still ships behind `billing_live` OFF.**
>
> ## Phase A keystone (shipped OFF · ADR-458)
>
> Phase A is the data-model foundation. It changes the SHAPE of entitlements without changing behavior
> while `billing_live` is OFF (gating still grant-all, `setSpacePlan` still a no-op):
>
> | Change | What | Where |
> |---|---|---|
> | **Entitlement partition** | `spaces.entitlements` splits into TWO namespaces, read as a **union**: top-level **manual** operator grants OR-ed with a reserved **`entitlements.billing`** object the plan/add-on resolver owns (service-role only). A key is granted if either source has it. Default-deny + malformed-blob safety unchanged. `crm.autonomy` stays a top-level per-Space dial, never a billing key. | `lib/spaces/entitlements.ts` (`spaceEntitlements` union read, `spaceBillingEntitlements`, `BILLING_NAMESPACE`) |
> | **Set-to-target resolver** | `setSpacePlan` + new `setSpaceAddons` REPLACE the billing namespace wholesale (no longer append-only). An add-on toggling OFF removes only its billing keys; a manual top-level grant of the same key survives. Still gated on `billingLive()` with the `force` escape. | `lib/pricing/space-plan.ts` |
> | **Plan collapse (code)** | `SPACE_PLANS = ['free','pro','nonprofit','organization']`. Pro core = `['crm','crm.playbooks']` (keeps the practitioner depth, non-regressive); add-ons = Marketing (`email`/`automation`/`multi_pipeline`/`reporting`), AI Engine (`crm.resonance`/`crm.resonance_ai`), Team (`team`), Branding (`whitelabel`). Nonprofit + Organization = core ∪ all add-ons. `asSpacePlan` narrows OLD labels (`practitioner`/`business`/`partner`/`whitelabel` → `pro`) at read time during the transition. | `lib/pricing/plans.ts` |
> | **Member-tier collapse (code)** | `deriveTier` maps the retired `supporter` → `crew` at read time (access-preserving). | `lib/core/entitlement.ts` |
> | **Migrations (files only, NOT applied)** | `20260915000000_pricing_plan_collapse.sql` (adds `spaces.is_comped`, moves each space's current grants into `entitlements.billing`, remaps `spaces.plan`, comps former Partner). `20260915000100_pricing_member_tier.sql` (collapses `membership_tier` to free/crew, adds `profiles.is_supporter`, backfills the PWYW badge). Behavior identical pre/post because the union read sees the same effective set. | `supabase/migrations/` |
>
> The Stripe price-key catalog (`lib/billing/pricing-keys.ts`) + the P3 price-display rows
> (`lib/pricing/display.ts`) stay on the LEGACY key/label names on purpose; Phase B rewrites the catalog
> into pro base + the four add-on items + the nonprofit seat. The coarse `space_*` plan-rank gates in
> `gates.ts` collapse to a single `pro` paid floor; the fine per-feature decision is the entitlement-key
> union the resolver writes.
>
> **Decision:** [ADR-458](DECISIONS.md). Below is the legacy (pre-collapse) model, kept for reference.

> **Status:** ✅ P1 shipped (the entitlements + admin-config foundation). ✅ P2 shipped (Stripe
> products/prices + subscription checkout + the webhook → entitlements, founder lock honored). ✅
> P3 shipped (member-facing upgrade/plan/join surfaces render the operator values, the cash-in gate
> routes through `featureAllowed`, white-label is a lead flow). **EVERYTHING STILL SHIPS OFF: no
> charge happens and no live Stripe call fires unless an operator has set env keys AND flipped
> `billing_live` + the per-tier switch.** The master `billing_live` switch is OFF by default, so
> members and spaces keep their current access exactly as today.
>
> **Decision:** [ADR-362](DECISIONS.md) (P1) · [ADR-363](DECISIONS.md) (P2) ·
> [ADR-364](DECISIONS.md) (P3, white-label-as-lead) · [ADR-373](DECISIONS.md) (Nonprofit + Partner
> plans, capability-ordered ladder, price changes, per-seat deferral). **Authoritative model:** the owner's
> "Frequency — Pricing Model & Feature Gating Spec." **Source of truth (code):** `lib/pricing/*`,
> `lib/billing/*`, the `/admin/pricing` console, and
> `supabase/migrations/20260723010000_pricing_foundation.sql` + `20260723020000_pricing_stripe.sql`.

## TL;DR

Frequency monetizes on **three independent flags**. The whole pricing system is built so that
each one moves on its own axis and is operator-editable from `/admin/pricing` — and so that turning
billing OFF leaves the product behaving exactly as it does today.

| Flag | What it means | Where it lives | Set by |
|---|---|---|---|
| **billing_tier** | What someone PAYS for | personal: `profiles.membership_tier` (`free`/`crew`/`supporter`) · space: `spaces.plan` (`free`/`practitioner`/`partner`/`nonprofit`/`business`/`organization`/`whitelabel`) | billing (P2) / operator |
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

| Plan | Monthly | Annual (≈ 2 months free) | Operator seats | For | Notes |
|---|---|---|---|---|---|
| Crew (member) | $9 | $90 | n/a | personal members | personal tier |
| Supporter (member) | $24 | $240 | n/a | personal members | personal tier |
| Practitioner (space) | $19 | $190 | 1 | solo practitioners | take-rate 8% |
| Partner (space) | comped (free) + revenue share | n/a | 1 | influencers/collaborators hosting a program | operator-assigned "by arrangement"; full business-level features; **not sold via checkout** |
| Nonprofit 501(c)(3) (space) | $29 | $290 | 3 (planned) | verified mission orgs | full business-level features; sold self-serve once enabled |
| Business (space) | $49 | $490 | 1 | growing teams | take-rate 5% |
| Organization (space) | $199 | monthly only | 1 | enterprise | take-rate 3%; **custom, built but not sold self-serve** |
| White-label (space) | $299 + ≈ $1,500 setup | monthly only | 1 | full branding removal | branding removal; setup is a high-touch lead, not checkout |

**Operator seats** are the count of operators who can administer the space. Seats are a **planned
follow-up** (not built yet): only Nonprofit carries a higher planned seat count (3); per-seat billing
is deferred (see below). Until seats ship, the column records the intended allocation, not a live
limit.

Other knobs: **Vera free cap** 10 messages/day · **annual discount** ≈ 2 months free · **trial** 14
days on Space plans, card upfront (members have no trial, the free tier is theirs; editable). Take-rates
are stored in basis points (800 = 8%). Separately, a **global AI spend ceiling** (`GLOBAL_DAILY_CAP_USD`,
`lib/ai/budget.ts`) hard-caps total Anthropic spend per day across every feature as an always-on cost
safety net (ADR-375).

**Capability order, not price order.** `SPACE_PLANS` (`lib/pricing/plans.ts`) is ordered by
**capability, not price**: Nonprofit and Partner rank **above** Business so they clear the
business-level feature gates (`space_email` / `space_automation` / `space_team` /
`space_multi_pipeline`) despite being cheaper (Nonprofit) or comped (Partner). A gate that asks for
"at least business" is satisfied by any plan at or above Business in the ladder, so the cheaper
mission plans inherit the full business feature set without duplicating the gate map.

**Partner** is comped (free) plus a revenue share and is **operator-assigned "by arrangement"** for
influencers and collaborators hosting a program; it is never offered through self-serve checkout.
**Organization** keeps its $199/mo price but is positioned as **custom, built but not sold
self-serve** (the same posture as white-label setup: a high-touch path, not a checkout button).

**Per-seat billing is a deferred follow-up.** The intended model is "3 included, +$9/seat" with extra
seats **auto-charged via Stripe**. It is not built yet; the operator-seat counts above describe the
planned allocation only.

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
| `space_email` / `space_automation` / `space_team` / `space_multi_pipeline` | plan | business (also cleared by Nonprofit + Partner via capability order) |
| `space_whitelabel` | plan | whitelabel |

The business-level gates ask for "at least business" against the capability-ordered ladder, so
**Nonprofit** and **Partner** clear them too despite being cheaper/comped (see "Capability order, not
price order" above).

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
creates/updates one Stripe **Product per tier** (Crew, Supporter, Practitioner, Nonprofit, Business,
Organization, White-label; **Partner** is comped and never carries a checkout Price) and a
**monthly + annual Price** from the admin `pricing_settings` values,
writing the resolved ids into `pricing_stripe_prices` (`key` → `stripe_product_id` / `stripe_price_id`
/ `archived`). It is **admin-triggered only** (the `/admin/pricing` "Sync products to Stripe" action),
**never** on import/boot, and a clear no-op when env is missing. Idempotent: Products are looked up by
a stable metadata key (`frequency_pricing_key`); Prices (immutable in Stripe) are reused when amount +
interval match, else a new Price is created. Founder prices are separate Price objects stored
`archived=true` (not public, referenced by `locked_price_id`). Keys: `crew_monthly`, `crew_annual`,
`supporter_monthly`/`_annual`, `practitioner_monthly`/`_annual`, `nonprofit_monthly`/`_annual`,
`business_monthly`/`_annual`, `organization_monthly`, `whitelabel_monthly`, plus the `*_founder`
variants for the member tiers. **Partner** has no checkout Price (comped + revenue share, operator-
assigned).

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

**Webhook → entitlements (idempotent, by `metadata.kind`).** The consolidated webhook
(`app/api/webhooks/stripe/route.ts`, ADR-506) routes subscription events through
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

## Phase B — the clean Stripe structure (ADR-460, supersedes the P2 per-plan Stripe model)

> **Status:** ⏳ built behind `billing_live` OFF (the master switch), migrations NOT applied. The P2
> per-plan Stripe catalog above is the legacy axis; Phase B is the structure the live system uses once
> the switch flips. See [PRICING-LADDER-PLAN.md](PRICING-LADDER-PLAN.md) and ADR-458/460. Migration
> file: `supabase/migrations/20260916000000_pricing_addons_seats.sql`.

The collapsed ladder (free / pro / nonprofit / organization) is sold as a typed **catalog of items**,
one Stripe **Product per item**, replacing the per-plan Product set above. The catalog is the code
source of truth in `lib/billing/pricing-keys.ts` (`CATALOG`, `catalogItems()`).

**The catalog (each item = one Product).** `pro_base`, `addon_marketing`, `addon_ai`, `addon_team`,
`addon_branding`, `nonprofit_seat`, `organization`. **Every item carries four prices: `{ list,
founding } x { month, year }`.** The **list** amount is the visible anchor (Pro $29); the **founding**
amount is the real price charged today (Pro $19). **Yearly = two months free = 10x monthly**
(`yearlyFromMonthly`, the single source of the annual math). Amounts today: Pro $29/$19, Marketing/AI
+$20, Team +$9/seat, Branding +$30, Nonprofit $15/$12 per licensed seat, Organization $249/$199.

**Price-row keys.** The founding (charged) price is `<item>_<interval>` (e.g. `pro_base_month`,
`addon_marketing_year`, `nonprofit_seat_month`, `organization_year`); the **list anchor** is the same
key plus `_list` (`pro_base_month_list`), synced `archived=true` (read only for the anchor amount, never
sold). Retired legacy keys (`practitioner_*`, `business_*`, `whitelabel_*`, `supporter_*`) are **kept
resolvable but archived, never deleted** (`RETIRED_CATALOG_KEYS`), so a grandfathered locked price id
still resolves.

**Catalog sync.** `lib/billing/pricing-products.ts` `syncPricingCatalogToStripe()` walks the catalog:
one Product per item (looked up by the same `frequency_pricing_key` metadata, idempotent) with its four
Prices (founding active, list archived-anchor), then archives the retired keys. Same gates as the P2
sync: env-gated (`billingEnabled()`), admin-triggered (the `syncStripeCatalog` action), never a live
call on import/boot/test, a clean no-op when Stripe is unconfigured.

**Multi-item subscription.** A Space buys Pro as **one subscription with multiple items**: the Pro base
plus **one price item per active add-on**, with **quantity items** for Team + Nonprofit seats.
`createSpaceLoadoutCheckout(spaceId, loadout)` (`lib/billing/space-plan-checkout.ts`) builds the line
items for a chosen loadout (base + add-ons / nonprofit seat / organization), monthly or yearly, with a
14-day per-item trial + proration. Gated on `spaceLoadoutSellable` (`billingLive()` + the per-plan
switch); returns `null` while OFF.

**Founding-price grandfather (locked price id).** Generalizing `profiles.locked_price_id` (ADR-363) to
space items: checkout charges the **founding** price and records the charged Stripe price id as the
per-item **`locked_price_id`** in `space_subscription_items`. On a renewal / add-on toggle, the checkout
**re-bills the locked price**, not the current list price (`readLockedPriceId`), so a founding
subscriber keeps their rate. A subscription **lapse ends the lock** (the item row is canceled); a fresh
subscribe pays the then-current founding price. Annual is the strongest lock (a full year held).

**Webhook set-to-target.** `lib/billing/space-subscriptions.ts` `reconcileSpacePlanSubscription` now
reads **all** of a subscription's items, maps each item's catalog key to its entitlement set, computes
the base plan + active add-on set (`planForItemKeys` / `addonsForItemKeys`,
`lib/billing/space-subscription-items.ts`), and calls **`setSpaceAddons`** (set-to-target the
billing-managed namespace, ADR-458). It persists each item row (incl. `locked_price_id`, `interval`,
`quantity`) and cancels rows for toggled-off items. A canceled subscription targets the **empty set**
(revert to free). A legacy single-price subscription (no recognized catalog items) falls back to the
`metadata.plan` path, so a grandfathered Phase A subscription still reconciles. Connect destination
charge + application fee (5/3/custom) + the founder lock are unchanged.

**Schema (Phase B migration, NOT applied).** `space_subscription_items` (one row per Stripe item on a
Space: `space_id`, `item_key`, `stripe_subscription_item_id`, `status`, `trial_ends_at`, `quantity`,
`interval`, `locked_price_id`; RLS: staff read all, a Space owner/admin reads their own, writes
service-role only) + `spaces.seat_quantity` (licensed seats, v1). Reached untyped (ADR-246).

## Phase C — the pricing surfaces (ADR-463)

Phase C is the operator/member surfaces that drive the Phase B backend. Still entirely OFF: every CTA is
a disabled preview while `billing_live` is OFF, the badge write is the only live mutation (harmless during
beta). **No migration** (the config lives in the existing `pricing_settings` kv store).

**Catalog config (operator overlay).** `lib/pricing/catalog-config.ts` reads each Phase B catalog item's
monthly **list** + **founding** amount (plus an optional explicit yearly override) from `pricing_settings`
under **`catalog.<item>`**, **fail-safe to the `CATALOG` code default per field** (so an absent row reads
the code amount; the code catalog stays the source of truth). Sibling keys: `catalog.seat` (the bundled
floor), `catalog.pwyw` (the Supporter min + suggested), `catalog.addon_enabled` (per-add-on offer toggle).
The yearly derives two months free unless overridden.

**Loadout math (one pure module).** `lib/pricing/loadout.ts` `computeLoadoutTotal` sums the Pro base + each
active add-on at the chosen interval (Team x its seat count), returning the list total (anchor) and the
founding total (charged). Pure + framework-free, so it runs identically on the client picker and the
server. Unit-tested (`lib/pricing/loadout.test.ts`).

| Surface | File | OFF state | ON state |
|---|---|---|---|
| **Admin catalog console** (C1) | `app/(main)/admin/pricing/` (`pricing-console.tsx`, `actions.ts`, `load.ts`) | edit every catalog list/founding amount, the per-add-on enable toggles, the seat floor, the Supporter PWYW config; the "Sync the catalog to Stripe" button (env-gated, safe no-op when unconfigured) | the catalog sync writes the Phase B Products/Prices; `billing_live` flip goes live |
| **Space Pro plan + add-on picker** (C2) | `app/(main)/spaces/[slug]/settings/billing/` (`loadout-picker.tsx`, `actions.ts` `startSpaceLoadoutCheckout`) | a disabled preview ("available soon"): the base + four add-on toggles, a live total, the monthly/yearly switch, the founding-under-list anchor, trial badges, "founding price held" when the space holds a locked base price | the buy CTA → `createSpaceLoadoutCheckout` (double-gated: `canManage` server-side + `billingLive` + the per-plan switch) |
| **Crew upgrade + PWYW badge** (C3) | `app/(main)/upgrade/page.tsx` + `supporter-badge.tsx` | the free-beta toggle (unchanged) + the Crew list→founding price + the mission-framing line; the Supporter badge opt-in (writes `profiles.is_supporter`, the only live mutation) | a live Crew Stripe checkout via `createMembershipCheckout` |

The **Crew list anchor** is an optional `TierPrice.list_cents` (jsonb-additive, no migration), seeded Crew
list $12 / founding $9. **Supporter is retired as a tier** and is now the PWYW badge; the contribution
charge stays dormant and the contributions ledger stays deferred (no ledger table). The Space picker
pre-selects the add-ons the space already holds via the pure `addonsHeldBy` reader.

## The /admin/pricing console

A janitor-gated operator surface (`app/(main)/admin/pricing/`, registered in
`app/(main)/admin/sections.ts` and `lib/admin/nav.ts` under Operations → Platform). Composes the
admin page kit (`AdminTemplate` + `FormSection` + `Toggle`). Routes:

| Route | What |
|---|---|
| `/admin/pricing` | the whole console |

Sections: **Switches** (master `billing_live`, prominent + OFF, with the "off = everything granted,
nothing charged" explainer; per-tier/plan enable; per-role gamification) · **Catalog** (C1/ADR-463: the
clean catalog editor — Pro base + the four add-ons + nonprofit seat + organization, each with a list
anchor + founding price; the per-add-on enable toggles; the seat bundled floor; the Supporter PWYW
config) · **Plans and prices** (the legacy per-plan values, in dollars; Crew shows its list→founding
anchor) · **Feature gates** (the editable feature → entitlement matrix with a per-feature enable toggle) ·
**Founding members** (the founder lock + locked-price reference, honored at checkout) · **Stripe
products** (status, the env-gated "Sync the catalog to Stripe" + legacy-product sync actions, and the
resolved `pricing_stripe_prices` map; the sync buttons are disabled until the Stripe env keys are set).
All writes are admin-gated server actions (`actions.ts`) that audit flag flips via `setPlatformFlag` →
`platform_flag_events`.

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
| Pricing display shaping (pure, P3) | `lib/pricing/display.ts` |
| Catalog config overlay (pure + IO, Phase C) | `lib/pricing/catalog-config.ts` |
| Loadout total math (pure, Phase C) | `lib/pricing/loadout.ts` · tests `lib/pricing/loadout.test.ts` |
| Member upgrade surface + PWYW badge (P3/C3) | `app/(main)/upgrade/page.tsx` · `supporter-badge.tsx` |
| Space plan + loadout picker + white-label lead (P3/C2) | `app/(main)/spaces/[slug]/settings/billing/` (`page.tsx`, `plan-picker.tsx`, `loadout-picker.tsx`, `whitelabel-request.tsx`, `actions.ts`) |
| Space membership join CTA (P3) | `components/spaces/membership-join.tsx` · `membership-join-card.tsx` · `lib/spaces/memberships-actions.ts` (`startSpaceMembershipCheckout`) |
| Vault cash-in gate wiring (P3) | `app/(main)/crew/store/actions.ts` (`redeemItem`) |
| Webhook → entitlements (by `metadata.kind`) | `lib/billing/space-subscriptions.ts` · `app/api/webhooks/stripe/route.ts` |
| Take-rate IO wrapper | `lib/billing/fees.ts` (`spaceTakeRateCents`) |
| Admin console | `app/(main)/admin/pricing/` |
| Tests | `lib/pricing/pricing.test.ts` · `lib/billing/pricing-keys.test.ts` · `lib/billing/space-subscriptions.test.ts` |

## P3 — member-facing surfaces + gate wiring (ADR-364)

P3 puts the layer in front of people, still entirely OFF until an operator turns billing on. Nothing
here charges or fires a live Stripe call while `billing_live` is OFF; every CTA degrades to a tasteful
disabled "coming soon" state, never a broken button.

**Pure display shaping.** `lib/pricing/display.ts` (`formatCents`, `priceRow`, `memberTierRows`,
`spacePlanRows`) shapes the operator-set `getPricingValues()` into the rows the surfaces render, so no
price is ever hardcoded. Pure + unit-tested (`lib/pricing/pricing.test.ts`).

**Sell gates.** `memberTierSellable(tier)` (new, `lib/pricing/settings.ts`) mirrors the existing
`spacePlanSellable(plan)` (`lib/billing/space-plan-checkout.ts`): both = `billingLive()` AND the
per-tier/plan `*_enabled` switch, FAIL-SAFE FALSE. A surface shows a live checkout CTA only when its
row is sellable; otherwise a disabled preview.

| Surface | File | OFF state | ON state |
|---|---|---|---|
| **Member upgrade** | `app/(main)/upgrade/page.tsx` | the free-beta toggle (unchanged) + a Crew/Supporter price preview from the operator values + a Founding-Member badge when `is_founding_member` | a live Crew/Supporter Stripe checkout via the existing `createMembershipCheckout` (founder lock already honored there) |
| **Space plan picker** | `app/(main)/spaces/[slug]/settings/billing/` (`page.tsx` + `plan-picker.tsx`) | the plan ladder with the current plan marked + disabled "coming soon" CTAs | "Upgrade to <Plan>" → `createSpacePlanCheckout` |
| **Space membership join** | `components/spaces/membership-join.tsx` + `membership-join-card.tsx` | the EXACT display-only `joinTier` behavior (no charge) | a paid tier opens `createSpaceMembershipCheckout` (Connect destination charge); falls back to `joinTier` if the owner is not payout-ready |
| **White-label** | `whitelabel-request.tsx` + `requestWhitelabel` action | a LEAD form (writes a `contacts` row, `source='whitelabel_request'`) — NOT a checkout | unchanged (always a lead; ADR-364) |

The space billing page is linked from the Manage-space hub (`settings/page.tsx`, "Plan and billing"
card) and is the `success_url`/`cancel_url` target `createSpacePlanCheckout` already pointed at.

**Gate consumption wired (additive, OFF-preserving).** The Vault **cash-in** server action
(`app/(main)/crew/store/actions.ts` `redeemItem`) now routes through `featureAllowed('vault_cash_in',
…, { billingLive })` IN ADDITION TO the existing `canCashIn(tier)` line. While `billing_live` is OFF,
`featureAllowed` short-circuits to `true`, so the action behaves EXACTLY as today; once billing is on,
the operator can retune the cash-in minimum from `/admin/pricing`. Tested in `pricing.test.ts`.

## Status & deferred

✅ **Done in P3:** member upgrade surface (operator prices, founder lock display, gated CTA) · space
plan picker → `createSpacePlanCheckout` · space membership join → `createSpaceMembershipCheckout`
(OFF preserves display-only join) · white-label lead flow (ADR-364) · `vault_cash_in` gate routed
through `featureAllowed` · pure display helpers + tests. All ships OFF.

✅ **Done in the deferred-gates batch (ADR-370, migration `20260727000000_pricing_deferred_gates.sql`).**
All wired through the OFF-preserving seam (`featureAllowed` grant-all while OFF, or gated on
`billingLive()`), so each is a NO-OP today and only bites once an operator turns billing on:

| Item | What shipped | Inert-while-OFF mechanism |
|---|---|---|
| **Leaderboard "join to compete" gate** | The individual board gates on `gamificationFullAllowed(tier)`; an earn-only member (billing ON) sees a calm `CompeteLocked` preview, still counted toward the shared goal. | `gamificationFullAllowed` → `featureAllowed('gamification_full')` grants while OFF, so the board renders exactly as today. |
| **`resolveGamificationAccess` live consumer** | `lib/pricing/gamification-access.ts` (`resolveViewerGamificationAccess` / `…WithFlags`) folds override → per-role flags → derive; consumed in `getCrewContext`. | With the seeded flags it returns exactly `deriveGamificationAccess(tier)` (today's line). |
| **`vera_unlimited` gate** | `lib/ai/vera/usage-gate.ts` enforces `vera_free_daily_cap` per member/day, routed through `featureAllowed('vera_unlimited')`; over the cap a free member degrades to the deterministic concierge. | OFF grants, so the cap never bites; no extra read changes the answer. |
| **`space_*` plan-feature gates** | `lib/spaces/function-access.ts` `spaceFunctionAccessLive` composes the pure resolver with `featureAllowed('space_crm'/'space_email'/…)`, wired into the CRM + email surfaces. | OFF grants, so it equals the pure `spaceFunctionAccess` result (today's behavior). |
| **`gamification_full` standalone gate** | `gamificationFullAllowed(tier)` — the single tier gate, reused by the leaderboard + season-reset nudge. | Routes through `featureAllowed('gamification_full')`; grants while OFF. |
| **Household / Circle bundle (P2)** | `lib/pricing/bundle.ts` + `bundleSellable()` + `lib/billing/bundle-checkout.ts`; config + `profiles.household_bundle_id` link in the migration. | `bundleSellable` = `billingLive()` AND `bundle_household_enabled` (OFF); checkout returns null while OFF. |
| **Dunning / proration / past-due UX** | `lib/pricing/dunning.ts` + `PastDueBanner` on `/settings/billing`; `profiles.membership_payment_status` in the migration. | `resolveMemberPaymentState` gated on `billingLive()` → returns `active` while OFF (banner dark); NULL column reads as active. |
| **Conversion-mechanics polish** | `lib/pricing/conversion.ts` (season-reset timing) + `SeasonResetPrompt`, shown only when `!gamificationFull` AND inside the reset window. | `gamificationFull` is true while OFF, so the nudge never renders. |

⏳ **Still deferred:**

| Item | Why deferred |
|---|---|
| **`pricing_*` type regen** | No DB access in the gates worktree; the parent session regenerates `lib/database.types.ts` via Supabase MCP at integration, then the untyped casts that read the new columns are removed. Blocked columns/casts: `profiles.gamification_access_override`, `profiles.membership_payment_status`, `profiles.household_bundle_id`, `spaces.plan` (projected in `lib/spaces/store.ts`), `space_memberships.payment_status` (P2), and the `pricing_settings` / `pricing_feature_gates` / `pricing_stripe_prices` tables (P1/P2). Until then every reader fail-safes to the seeded code defaults. |
| **Per-seat operator billing (ADR-373)** | The seat model ("3 included, +$9/seat", extra seats auto-charged via Stripe) is a planned follow-up, not built. Only Nonprofit's higher seat count (3) is recorded as intent; until seats ship there is no live seat limit or per-seat charge. |

## Roadmap

| Phase | Scope |
|---|---|
| ✅ **P1** | entitlements layer + operator config + `/admin/pricing` console; everything OFF |
| ✅ **P2** | Stripe wiring: product/price sync, subscription checkout for tiers/plans/space-memberships, the webhook calls `setSpacePlan`, founder lock honored at checkout; still ships OFF |
| ✅ **P3** | member-facing upgrade/plan/join surfaces on the operator values, white-label as a lead, the `vault_cash_in` gate routed through `featureAllowed`; still ships OFF (see Status & deferred) |
| ✅ **Deferred gates (ADR-370)** | leaderboard compete · gamification access consumer + standalone gate · `vera_unlimited` · `space_*` via `featureAllowed` · Household bundle · dunning/proration UX · season-reset conversion nudge; all NO-OP while OFF |
| ✅ **Nonprofit + Partner plans (ADR-373)** | new Nonprofit (501c3) self-serve plan + comped Partner plan, capability-ordered `SPACE_PLANS` ladder, Practitioner/Business/white-label price changes, Organization repositioned custom; per-seat billing deferred; ships inert (billing OFF) |
| ✅ **Ladder Phase A (ADR-458)** | entitlement partition (billing namespace) + `setSpaceAddons` set-to-target + plan/member-tier collapse; ships OFF |
| ✅ **Ladder Phase B (ADR-460)** | clean Stripe catalog (one Product/item, list+founding x month+year) + multi-item subscription + generalized locked-price grandfather + set-to-target webhook; ships OFF |
| ✅ **Ladder Phase C (ADR-463)** | the surfaces: `/admin/pricing` catalog console + the Space Pro plan/add-on picker (live loadout) + the Crew upgrade + PWYW Supporter badge; types regenerated; ships OFF |

## References

- Decision: [ADR-362](DECISIONS.md) · Authoritative spec: the owner's pricing & feature-gating spec
- Reused seams: `lib/core/entitlement.ts` · `lib/spaces/entitlements.ts` ·
  [ROLES.md](ROLES.md) (the role/entitlement axes) · [SPACES.md](SPACES.md) (tenancy)
- Billing env gate: `lib/billing/stripe.ts` (`billingEnabled`) · operator flags: `lib/platform-flags.ts`
