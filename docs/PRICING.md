# Pricing & entitlements

> ## ✅ CURRENT (the ladder): the Opening Beta price is CLOSED, and yearly is the only discount (ADR-1060, 2026-08-17).
>
> Owner-ruled: *"scratch the beta pricing and just charge full price. They can get 2 months free for
> purchasing the year."* This overrides every beta rate quoted anywhere below this banner.
>
> 1. **The charged ladder is the LIST ladder.** Member $0 · Crew contribute-what-you-want (floor $4.99) ·
>    Free Space · **Business $29** · **Collective $79** · Non Profit $39 · Independent $249 ·
>    Vera AI add-on +$20. **Exactly two figures moved** (Business $19 → $29, Collective $49 → $79,
>    annuals following at 10x: $190 → $290 and $490 → $790). Independent, Non Profit and the add-on
>    already had `listCents == foundingCents`, so they did not move.
> 2. **No struck anchor renders anywhere, and no "Beta rate" caption.** `effectiveCatalogAmounts` /
>    `effectiveTierPrice` collapse the founding anchor into the list price once the window is past, so
>    the strike and its caption stop rendering on their own. A crossed-out $29 beside a charged $29
>    would be a false claim, and `pricing-grid.test.ts` sweeps every offering and every comparison cell
>    for one.
> 3. **The mechanism is ONE constant**, `BETA_PRICING_ENDS_AT` in `lib/pricing/beta.ts`, now a past
>    instant. The checkout key switch and every pricing surface read the same answer, so display and
>    billing cannot diverge. Re-opening the window is a one-line edit; no test pins the date.
> 4. **Two months free on the year is unchanged** (`ANNUAL_MONTHS_FREE = 2`, `yearlyFromMonthly`). It
>    was already the house rule; it is now the only discount, so the copy leads with it.
> 5. **Not changed by this, and not to be assumed:** the FEATURE-GATE grace window (`beta_grace`) still
>    ends **2026-09-01** (selling and gating are separate decisions, ADR-874), and
>    `FOUNDING_DEFAULT.business_monthly_cents` is still **$19** for the Founding Business grant — NOT changed by ADR-1067, which touched only the catalog. See OWN-026.
> 6. **Grandfathering cost nothing in Stripe and is not nothing in fact.** 0 subscription items, 0
>    Stripe customers, 0 webhook events on 2026-08-17 — and one member who paid **$490 in cash** for the
>    annual Collective beta rate with no lock anywhere in the system (backlog `OWN-022`).
> 7. **The beta rate is still reachable, privately, per Space** ([ADR-1061](DECISIONS.md)). The owner
>    had already offered it to a couple of people: *"I want to keep that open for them. But I don't
>    want to advertise that Beta pricing as a package on the website."* `spaces.beta_price_grant` is a
>    per-Space flag that ONLY the checkout reads. The charge decision is the pure
>    `loadoutChargeArm` (`lib/pricing/beta.ts`): **lock** (re-bill the Space's grandfathered
>    `locked_price_id`) → **founding** (the window is open **or** this Space carries the grant) →
>    **list**. No pricing surface, funnel door or `effectiveCatalogAmounts` call takes a Space, so the
>    public grid cannot move; `lib/pricing/beta-grant.test.ts` sweeps every number and label a visitor
>    reads for a leaked beta amount. **The grant carries no expiry** because the first successful
>    checkout writes the lock, and the lock wins from then on. Operator control: `/admin/spaces/[id]`
>    → "Beta price grant" (janitor-gated, audited). Schema: `docs/proposals/OWN-023-space-beta-price-grant.sql`,
>    a proposal, not a migration — the code fail-safes to list pricing until it is applied.
> 8. **In STRIPE, the founding rates hang on their own Product** ([ADR-1062](DECISIONS.md)). Owner:
>    *"standard pricing does not have a founding or beta rate ... Regular pricing + a founding beta
>    product."* `syncPricingCatalogToStripe` mints **Frequency Collective** ($79 / $790) and, separately,
>    **Frequency Collective (Founding rate)** ($49 / $490) — and Collective ALONE (ADR-1067: the owner's
>    instruction is one unlisted beta offer, granted by hand). A flat item (Business, Independent,
>    Non Profit, Vera AI) has no founding rate to separate, so it gets no second product. **6 products,
>    20 prices.** **No price KEY
>    moved**: `collective_base_year` is still `collective_base_year`, so the grant and every lock resolve
>    exactly what they resolved before, and both variants stay ACTIVE in Stripe so the grant can charge
>    them.

> ## ✅ CURRENT (money model): selling is FREE on every tier; the RATE is the ladder (ADR-914, 2026-07-30).
>
> Owner-ruled. This overrides every rate and every seller rule stated anywhere below this banner.
> **The full strategy, per-feature tier map, phased build and verification protocol live in
> [VALUE-LADDER.md](VALUE-LADDER.md).** This file remains the MECHANICAL reference: the three-flag
> model, the gate table, and the Stripe wiring.
>
> 1. **A free Member can sell.** Tickets, donations, payouts, on day one, with no upgrade. The
>    previous rule (ADR-913: "the free tier does not sell") is REVERSED. A free Member who hits a
>    paywall does not upgrade, they send people to Venmo, and both the sale and the contact are lost
>    permanently. **Never gate the transaction. Gate the repeat.**
> 2. **The rate is the ladder**, on network-sourced sales only: free Member **10%** · Crew **8%** ·
>    free Space **10%** · Business **5%** · Collective **3%** · Non Profit **0%** · Independent
>    **0%** (off the network).
> 3. **0% on your own audience, on every tier, forever.** A follow, an active membership, a CRM
>    contact, a personal contact, or a prior settled purchase — any one proves the relationship
>    (`lib/commerce/seller-audience.ts`). Frequency charges for the introduction, never the
>    relationship.
> 4. **Tips carry NO platform fee. Zero, on every tier.** Unchanged from ADR-913.
> 5. **The three walls** are selling memberships (Business), campaigns and funnels (Business), and
>    revenue splits (Collective). Everything else is a meter with a real free allowance.

> ## ✅ Crew is CONTRIBUTE-WHAT-YOU-WANT and the Member/Crew line is "first one free" (ADR-908, 2026-07-29; renamed from "pay what you want" by ADR-1084).
>
> **Crew is the leadership tier.** Before this, Crew gated three switches (`vault_cash_in`,
> `gamification_full`, `vera_unlimited`) and two meters, none of which were about leading. It now
> carries the acts of running community, split from the free tier by **first one free**: a Member does
> anything once, Crew does it repeatedly, publicly, and for money.
>
> | | Free Member | Crew |
> |---|---|---|
> | Circles hosted | **1** (and you are made a Host: role stays earned, ADR-207) | unlimited |
> | Journeys published | 1, share by link | unlimited, **listed in the public library** |
> | Practices published | 3 | unlimited |
> | Active events | 2, free or RSVP only | unlimited, incl. recurring series |
> | Charge for an event | no | **yes** (`event_paid_tickets` + `personal_payouts`) |
> | Entry points (QR, links, flyers) | no | **yes** |
> | Vault, rewards loop, Vera | earn only · earn only · 10/day | spend · full loop · unlimited |
> | Network-sourced sale rate | **cannot sell** (RSVPs only, ADR-913) | **8%** |
>
> **Crew's price is chosen by the member.** Floor **$4.99**, suggested **$24.99** (pre-selected), five
> preset anchors plus an always-visible "another amount", annual at **10x the chosen monthly**.
> 🔴 **Every amount buys IDENTICAL access** — the moment a higher amount buys more, it is a tier ladder
> and the framing is a lie. Higher amounts buy the Supporter mark (at or above the suggested amount)
> and fund the build, never capability. Config: `PWYW_CONFIG_DEFAULT` + `isValidPwywAmount` /
> `earnsSupporterMark` (`lib/pricing/catalog-config.ts`); operator-editable at `/admin/pricing`.
>
> **There is no comped Crew.** "Never gate someone out" rests on the free tier being genuinely
> complete, and it is. No per-amount label may claim to cover another member's seat, because none does.
>
> **Checkout** bills an inline `price_data` subscription at the chosen `unit_amount` under a stable
> `STRIPE_PRODUCT_CREW` product. A chosen amount **skips price resolution entirely, including the
> founder lock** (a grandfathered price is meaningless when the member sets the price). With no chosen
> amount, `createMembershipCheckout` behaves exactly as before.
>
> **Collaboration is a ladder, not a wall.** `space_collaborators` opens at **Business** (metered: 3
> hosted collaborators) and goes unlimited at Collective. The true Collective line is the new
> **`space_revenue_splits`**: hosting a few partners is Business, sharing money with them automatically
> is the collaboration engine. New sibling gate: `space_sms` (Collective, rides A2P 10DLC).
>
> **The personal take-rate is Crew's alone.** ⚠️ ADR-913 (the banner above) settled this: there is no free
> personal rung to rate, because a free Member **cannot sell** (events + RSVPs only). `NetworkTakeRate`
> carries **one** personal rate, `member` (**8%**), charged only on a **network-sourced** sale; the
> seller's own audience is **0%** and a tip is **0%**. The `member_free` **10%** rung this section
> originally introduced is **RETIRED** and must not be quoted as current. Fail-safe direction is
> unchanged: an omitted or unrecognized `sellerTier` charges the paid rate (8%) rather than inventing a
> higher one, and no operator row can raise anyone to 10%.
>
> **Still inert.** Every gate short-circuits to grant while `featureGatesLive()` is false. Call-site
> enforcement and the picker UI are follow-ups; this change is the MAP, which the surfaces derive from.

> ## ✅ The public ladder is SEVEN sellable tiers, and `/pricing` DERIVES them (ADR-1052, 2026-07-28).
> **The ladder, all of it sellable:** Member $0 · **Crew $9** · **Free Space** · **Business $29** ·
> **Collective $79** · **Non Profit $39** · **Independent $249**. ⚠️ The public window is CLOSED
> (ADR-1060) and Business no longer has a beta rate at all (ADR-1067): the ONLY beta rate in the catalog
> is Collective's $49 / $490, which is unlisted and granted by hand.
> While the window was open they were grandfathered: a subscriber keeps the rate for as long as they
> keep the plan. Non Profit,
> Independent, and the free tiers have ONE price and never render a struck anchor.
>
> **The anchor idiom (ADR-463) is now uniform across `pricing_settings`:** `monthly_cents` is what is
> CHARGED and `list_cents` is the crossed-out anchor above it, exactly as `tier.crew` has always worked. So
> `plan.business` is `{1900, list 2900}` and `plan.collective` is `{4900, list 7900}`, matching the catalog
> amounts (`business_base`, `collective_base`) the checkout charges. `pricing.test.ts` asserts the two
> layers agree, so they cannot drift. `plan.collective` + `plan.independent` are seeded editable rows
> (migration `20270115000000_pricing_beta_anchors.sql`).
>
> **The public page is derived, not written.** `lib/pricing/pricing-grid.ts` builds every offering and
> every comparison cell from the code the product actually gates on: `planEntitlementKeys` (the depth key
> sets in `plans.ts`), `FEATURE_GATES`, the usage ladders in `feature-meters.ts`, and
> `take_rate.network_bps`. Seats derive from the `team` depth key; the AI add-on derives from
> `ADDON_ENTITLEMENT_KEYS`. **To change what a tier gets on `/pricing`, change the key set — never the
> page.** The page reads `getPricingValues()` + `loadCatalogConfig()` at revalidation, so an
> `/admin/pricing` price edit lands with no deploy, and a source-shape test forbids any dollar literal in
> the page file.

> ## ⚠️ SUPERSEDED by the Community Collective model (ADR-811, July 2026). Read this first.
> The pricing direction is now the **Community Collective**: two-world pricing on `spaces.network_connected`
> (in-collective = affordable, standalone = standard SaaS) and a take-rate charged **only on
> network-sourced business** (0% on own bookings). Source of truth:
> [COMMUNITY-COLLECTIVE-STRATEGY.md](COMMUNITY-COLLECTIVE-STRATEGY.md) · plan:
> [COMMUNITY-COLLECTIVE-BUILD-PLAN.md](COMMUNITY-COLLECTIVE-BUILD-PLAN.md) · [ADR-811](DECISIONS.md).
>
> **The PUBLIC ladder (founder's ladder, ADR-878, updated 2026-07-30):** Member $0 · **Crew: pay what
> you want**, floor $4.99/mo, $24.99 suggested, no list anchor (see "Crew is PWYW" below) ·
> **Free Space** (the first level of
> Space) · Business $29 (the $19 Opening Beta price is CLOSED, ADR-1060) · Collective $79 (same, the
> $49 beta price is closed) · Non Profit $39 flat ·
> the **Vera AI** add-on +$20 (catalog key `addon_ai`) · operator seats owner-priced. **Independent
> (~$249) is NOT listed or sold** (`plan_independent_enabled` OFF; machinery dormant, grandfathered
> spaces keep resolving). ⚠️ "Opening Beta price" is RETIRED as a copy phrase (ADR-1060): no surface may
> offer a beta rate, because the checkout no longer charges one.
>
> **Supporter is NOT on the ladder (ADR-878).** ADR-458 retired it as a tier (it became the
> pay-what-you-want `profiles.is_supporter` badge); ADR-818 briefly sold it again at $12; ADR-878 removed
> it from the sell + display paths for good, and cleared Crew's $12 anchor with it. `tier.supporter` is
> gone from `PricingDefaults`, `memberTierSellable('supporter')` refuses regardless of the flag, and the
> `supporter_*` price keys are RETIRED-but-resolvable. The read-time `supporter -> crew` mapping in
> `lib/core/entitlement.ts` STAYS, so a historical row never loses access. The Supporter BADGE and its
> PWYW contribution channel are untouched. Operator SQL: `scripts/adr-878-retire-supporter-tier.sql`.
> Every mention of a sellable Supporter tier below this line is historical.
>
> **Billing went LIVE 2026-07-25** (owner flipped `billing_live` + the plan switches; Stripe
> configured). After any price change here or in code, re-run BOTH Stripe syncs in the admin pricing
> console (products + catalog) so the live Stripe prices match the anchors. The entitlement-partition /
> Stripe / grandfather plumbing below still applies; the plan shape + prices do not. Everything under
> here is historical.

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

`featureAllowed(feature, account, { gatesLive })` is the single resolver. **`gatesLive` is
`featureGatesLive()`, NOT `billingLive()`** (ADR-874): "may we charge" and "do the gates bite" are
different decisions on different dates, and the gates ride the second one. Seeded features:

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

`billing_live` defaults OFF, and the CHARGING gate is `billingLive()` = `billingEnabled()` (the Stripe
env keys) **AND** the `billing_live` flag — so billing is OFF even with env keys present until an
operator flips the master switch.

The GATING gate is separate (ADR-874): `featureGatesLive()` = `billingLive()` **AND** the `beta_grace`
window has ended (`{ until: '2026-09-01' }` by code default; no migration seeds it). So turning billing
on opens checkout **without** taking any feature away, and the ladder starts biting on the grace date at
00:00 UTC. `billingLive()` fails CLOSED (its failure charges someone); `featureGatesLive()` fails OPEN to
grant (its failure strips someone). While EITHER is off:

- `featureAllowed(...)` **short-circuits to `true`** (grant everything) whenever the GATES are not live.
  No surface that consults it changes behavior.
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
| `createSpaceMembershipCheckout(spaceId, tierId, memberId)` | member joins a paid space tier; **Connect destination charge**, application fee = the SPACE plan's take-rate (read from `pricing_settings`; the current rungs are in the ADR-913 banner at the top, not the legacy 8/5/3); metadata `{ kind:'space_membership', space_id, tier_id, member_id }` | `billingLive()` + owner Connect-ready |

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
key plus `_list` (`pro_base_month_list`), synced `archived=true`. ⚠️ Two clauses of that sentence are
now historical: since [ADR-1060](DECISIONS.md) the **`_list` key is the one checkout charges**, and the
`archived` flag is a row annotation nothing reads to decide a charge (`resolveStripePriceId` ignores it),
so it no longer says "not sold". The key STRINGS are unchanged and are frozen by
`lib/billing/pricing-catalog-sync.test.ts`. Retired legacy keys (`practitioner_*`, `business_*`, `whitelabel_*`) are **kept
resolvable but archived, never deleted** (`RETIRED_CATALOG_KEYS`), so a grandfathered locked price id
still resolves. (`supporter_*` was retired here too until the 2026-07 overhaul un-retired it, ADR-818.)

**Catalog sync.** `lib/billing/pricing-products.ts` `syncPricingCatalogToStripe()` walks the catalog and
mints, per item, the **standard** Product carrying the LIST prices plus — only when the item really is
discounted below list — a **separate founding Product** carrying the founding/beta rates (ADR-1062), then
archives the retired keys. Same gates as the P2 sync: env-gated (`billingEnabled()`), admin-triggered
(the `syncStripeCatalog` action), never a live call on import/boot/test, a clean no-op when Stripe is
unconfigured.

| | Standard Product | Founding Product |
|---|---|---|
| Name in the dashboard | `Frequency Collective` | `Frequency Collective (Founding rate)` |
| Lookup metadata (`frequency_pricing_key`) | `collective_base` | `collective_base_founding` |
| Prices on it | `collective_base_month_list` $79 · `collective_base_year_list` $790 | `collective_base_month` $49 · `collective_base_year` $490 |
| Exists for | every synced item | only an item with `foundingCents < listCents` (today: Business, Collective) |

Both Products also carry `frequency_catalog_item` (the item they belong to) and `frequency_product_line`
(`standard` / `founding`), so a human can pair them without parsing names. **The price-row KEYS are
untouched by the split** — a Product is where a Price hangs, and `pricing_stripe_prices` is keyed by the
KEY, so `resolveStripePriceId` / the per-Space grant / a lock all resolve exactly what they did before
(`lib/billing/pricing-catalog-sync.test.ts` freezes the whole key set). **No Price is ever archived in
Stripe** by the sync: `archived` on a map row is an annotation on the row, never Stripe's `active`, and
the founding price ids must stay usable in a NEW subscription for the ADR-1061 grant to charge them.

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
charge + application fee (the operator take-rate for the seller's tier, ADR-913) + the founder lock are
unchanged.

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
| **Crew upgrade + PWYW badge** (C3) | `app/(main)/upgrade/page.tsx` (`upgrade-toggle.tsx` + `pwyw-picker.tsx`) | the free-beta toggle (unchanged) + the Crew list→founding price + the mission-framing line; the Supporter badge is **earned through the PWYW picker** (`earnsSupporterMark` → `confirmSupporterContribution`, which writes `profiles.is_supporter`, the only live mutation) | a live Crew Stripe checkout via `createMembershipCheckout` |

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
| Member upgrade surface + PWYW badge (P3/C3) | `app/(main)/upgrade/page.tsx` · `pwyw-picker.tsx` · the display pill `components/supporter-badge.tsx`. (`app/(main)/upgrade/supporter-badge.tsx`, the separate opt-in box, was deleted 2026-08-12 — it had no importer after the box was folded into `PwywPicker`.) |
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
| **Household / Circle bundle (P2)** | `lib/pricing/bundle.ts` + `bundleSellable()` + `lib/billing/bundle-checkout.ts`; config + `profiles.household_bundle_id` link in the migration. **All three pieces shipped 2026-08-12.** Checkout stamps the owner, the seat roster and the purchased terms. The webhook branch `lib/billing/bundle-seats.ts` seats them through `apply_bundle_seating_atomic` (migration `20270225000000_household_bundle_seating.sql`, **applied to production**). Post-purchase seats are **invites**, not assignments (a seat takes over someone else's `membership_tier`, so it is offered and accepted — the `circle_transfer_offers` reasoning, ADR-845): `lib/billing/bundle-invites.ts` + `household_bundle_invites` + `create_bundle_invite_atomic` / `accept_bundle_invite_atomic` (migration `20270226000100_household_bundle_invites.sql`, **applied to production**), surfaced in the Plan and billing section of `/settings`. A PENDING invite counts against the purchased seat count, so a bundle cannot be oversold. 🔴 Acceptance deliberately does **not** write `profiles.household_bundle_event_at` — that column orders Stripe events, and advancing it would make a real cancellation look stale and leave a canceled bundle seated. | `bundleSellable` = `billingLive()` AND `bundle_household_enabled` (OFF); checkout returns null and every seat surface renders nothing while OFF, so no bundle subscription exists for the webhook branch to seat and no invite can be written. |
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
