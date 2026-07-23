# Community Collective, end-to-end rebuild plan

> **Status:** ✅ Approved (2026-07-23). The full implementation plan for the repositioning + repricing in
> [COMMUNITY-COLLECTIVE-STRATEGY.md](COMMUNITY-COLLECTIVE-STRATEGY.md) (the source of truth) and
> [ADR-811](DECISIONS.md). Grounded in a full scan of the live codebase. **Every phase ships behind
> `billing_live` OFF and is an independently reviewable PR set. Nothing is user-visible until a single
> deliberate go-live flip.** Effort legend: **S** small · **M** medium · **L** large · **XL** extra-large.
> Tag legend: 🆕 net-new · ✏️ edit · 🔸 light.

## How to use this doc

Work top to bottom by phase; each phase names its exact surfaces (with paths), the deep detail, its
dependencies, and its OFF-safety. Phases 0-3 are the foundation (canon, engine, take-rate, the connect
switch); 4-5 are the in-product experience; 6-8 are the public rebrand + growth; 9 is help + go-live. §A is
the deepest technical design (the differential take-rate). §B is the marketing-funnel-by-funnel nuance. §C is
the migration ledger. §D is the research appendix.

---

## Phase 0 — Canon & strategy (docs) · M · ✅ this PR

Goal: record the decision and amend the canon so nothing downstream is blocked or drifts. No code, no live change.

| Surface | Change | Tag |
|---|---|---|
| `docs/COMMUNITY-COLLECTIVE-STRATEGY.md` | The source of truth (model, tiers, take-rate, philosophy). | 🆕 |
| `docs/COMMUNITY-COLLECTIVE-BUILD-PLAN.md` | This plan. | 🆕 |
| `docs/DECISIONS.md` | ADR-811: the model, supersedes ADR-552/590. | ✏️ |
| `docs/NAMING.md` | Add Collective + Independent tiers; "Community Collective" brand; the Collective collision-guard (brand + tier canonical, Quest usage kept, marketing label renamed); retire the "no tier names" clause. | ✏️ |
| `docs/CONTENT-VOICE.md` | Positioning addendum: collaboration-first, the four brand promises, mission-as-invitation. | 🔸 |
| `docs/PRICING.md`, `docs/PRICING-LADDER-PLAN.md`, `docs/BUSINESS-MODEL-PLAN.md` | Header banners pointing to the new model; mark flat-$49 historical. | 🔸 |

Dependency: owner approval (done). Unblocks every later phase.

---

## Phase 1 — Pricing engine foundation · XL · ✅ shipped

Goal: teach the entitlement/catalog engine the six tiers and the new prices. Behind OFF (grant-all preserved).

| Surface | Change | Tag |
|---|---|---|
| `lib/billing/pricing-keys.ts` | Add `collective` ($79 list / $49 founding) + `independent` (~$249) catalog items + plan keys; move Business to **$29 flat**; Non Profit **$29 → $39**; add source-aware take-rate helpers (see §A). | ✏️ |
| `lib/pricing/plans.ts` | Extend `SPACE_PLANS = ['free','business','collective','nonprofit','independent']`; **un-fold white-label** from a Business entitlement key into the Independent tier; per-tier `PLAN_ENTITLEMENT_KEYS`; keep `LEGACY_PLAN_REMAP` for grandfathering. | ✏️ |
| `lib/pricing/gates.ts` | Move collaboration + automation fences to `collective`; add the connected/disconnected axis as a gate input (Independent is a *pricing* axis, not a capability downgrade). | ✏️ |
| `lib/pricing/feature-meters.ts` | Re-key allowances across six tiers; **remove contact + member-count caps** (never gate community size); keep bookings/tickets/email/AI volume caps as the pinch levers. | ✏️ |
| `lib/pricing/feature-tiers.ts` | Extend the display ladders (`SPACE_LADDER_TIERS`, `MEMBER_LADDER_TIERS`) to six tiers; per-tier price columns. | ✏️ |
| `lib/pricing/settings.ts` | `PRICING_DEFAULTS` for the new tiers (Business $29, Collective $79/$49 beta, Non Profit $39, Independent $249); per-tier enable flags; reshape `take_rate` into a per-tier **network-sourced vector** + explicit 0% self. | ✏️ |
| `lib/pricing/space-plan.ts`, `catalog-config.ts`, `loadout.ts`, `display.ts` | Handle new plan → key sets; catalog config rows; picker items; labels/anchors. | ✏️ |
| `app/(main)/admin/pricing/*` | Widen the console (`pricing-console.tsx` `TIER_*`/`PLAN_*` arrays, `load.ts`, `actions.ts`) from 2+2 to six tiers; add Collective beta + Independent panels; model take-rate as network-sourced-with-per-tier-drop. | ✏️ |
| `supabase/migrations/*` | CHECK-constraint swaps: `profiles.membership_tier`, `space_subscription_items.item_key`. New plan values on `spaces.plan` (free-text, safe). Collective beta price rows in `pricing_settings` / `pricing_stripe_prices`. | 🆕 |

Dependency: Phase 0. OFF-safe: `featureAllowed` short-circuits to grant while OFF; every reader fail-safes to code defaults.

---

## Phase 2 — The differential take-rate · XL · 🔴 critical path · ✅ shipped

Goal: charge the take-rate **only on network-sourced commerce**, 0% on a member's own bookings, rate dropping
with tier. This is the one genuinely new subsystem (no attribution concept exists today). Full design in **§A**.

| Surface | Change | Tag |
|---|---|---|
| `supabase/migrations/*` | Add an order **attribution** column (e.g. `commerce_orders.source` ∈ `self`/`network` + an optional `attribution_ref`). Default `self`. | 🆕 |
| `lib/billing/fees.ts` | Add `source: 'self'|'network'` to `spaceTakeRateCents` / `memberTakeRateCents`; `self → 0 bps`, `network → tiered bps`. | ✏️ |
| `lib/billing/pricing-keys.ts` | Source-aware `takeRateBps` math (per-tier network vector). | ✏️ |
| `lib/commerce/checkout.ts`, `lib/commerce/orders.ts`, `lib/billing/tickets.ts`, `lib/billing/tips.ts` | Classify each order's source at creation (referral/discovery/marketplace cookie + entry-point → `network`; direct → `self`) and thread it into the fee call. | ✏️ |
| Attribution source of truth | Reuse the existing `lib/attribution/*` + `lib/qr/referral.ts` cookies (`fq_ref`, first-touch, entry-point) to decide `network` vs `self`. | ✏️ |

Dependency: Phase 1. Blocks Phase 5. **Correctness is the top risk** (see §A + Risks): default to `self`/0% on any ambiguity.

---

## Phase 3 — network_connected wiring (in-collective vs standalone) · L · ✅ shipped

Goal: activate the dormant `spaces.network_connected` flag so it actually drives (a) which pricing world a
space is in and (b) network inclusion (discovery/referrals/take-rate eligibility).

| Surface | Change | Tag | State |
|---|---|---|---|
| `lib/pricing/network-world.ts` (resolver) | New PURE two-world resolver: `pricingWorldFor` (connected → affordable ladder; disconnected → Independent/standard SaaS) + `effectiveOrderSource` (disconnected collapses every order to `self`/0%). | 🆕 | ✅ |
| `lib/spaces/discovery.ts` | Second discovery gate: lists only `visibility='network'` **AND** `network_connected=true` spaces (standalone Spaces walled off). | ✏️ | ✅ |
| `lib/spaces/provision.ts` | Default `true` already set on every create path (provision, importer, root seed); Independent onboarding will opt out in Phase 4. | 🔸 | ✅ (no change needed) |
| Take-rate eligibility | `effectiveOrderSource` threaded into all three fee-bearing paths (checkout store, tickets, space memberships): a disconnected space returns `self`/0 regardless of any referral signal. | ✏️ | ✅ |
| `supabase/migrations/20261206000000_spaces_network_connected_default.sql` | Flip column default to `true` + backfill listed spaces so activating the discovery gate drops nothing. | 🆕 | ✅ |

Dependency: Phase 1. OFF-safe: fee math already short-circuits to `self`/0 while billing is OFF; discovery gate is behavior-preserving because every listed space is already connected.

---

## Phase 4 — In-product surfaces · XL

Goal: the member + operator experience of the six tiers and the take-rate story.

| Surface | Change | Tag |
|---|---|---|
| `app/(main)/upgrade/*` (`page.tsx`, `upgrade-toggle.tsx`, `checkout-button.tsx`, `actions.ts`) | Single Crew card → the multi-tier ladder; beta Collective price; tier-aware checkout; take-rate messaging. | ✏️ |
| `.../settings/billing/billing-body.tsx` | Single Go-Business CTA → the tier picker; reframe the "you'd have saved $X" nudge as the **network-only** take-rate story. | ✏️ |
| `.../settings/billing/plan-picker` | The six-tier plan picker with buy-down-your-rate framing. | 🆕 |
| Independent / white-label request | The disconnect-to-standalone request + pricing surface (none exists today). | 🆕 |
| `lib/pricing/tease-gate.ts` + ~7 wired call sites (`app/(main)/layout.tsx`, `practices/[id]`, `settings/profile`, `connections/[id]`, `vault-store`, `vera-chat`, `profile-qr-card`) | Grow the tier axis free→crew into six tiers; re-point each locked-preview upsell at the correct floor. | ✏️ |
| `components/spaces/feature-locked-notice.tsx`, `components/quest/compete-locked.tsx`, `season-reset-prompt.tsx`, `components/pricing/feature-*-upsell.tsx` | Regenerate ladders + upgrade targets for six tiers. | ✏️ |
| `components/spaces/membership-join*`, `seat-editor.tsx`, `seat-counter.tsx`, `billing/verify/` | Take-rate application + copy; per-tier seats; Non Profit as first-class $39. | 🔸 |

Dependency: Phase 1 (Phase 3 for the Independent surface). OFF-safe: every CTA degrades to a disabled preview while OFF.

---

## Phase 5 — "Network earned you $X" readout · L · philosophy centerpiece

Goal: the honest receipt. Show every member + operator what the network sourced for them.

| Surface | Change | Tag |
|---|---|---|
| `lib/commerce/orders.ts` | Extend `spaceEarningsSummary()` to split network-sourced vs self (from the §A attribution). | ✏️ |
| `components/spaces/dashboard/space-dashboard.tsx`, `.../manage/*` | Operator card: "the network sourced you $X this month." | ✏️/🆕 |
| Member-facing readout | A member surface for "$ the network earned you" (no member earnings/wallet surface exists today). | 🆕 |

Dependency: Phase 2 (needs attribution). This is the surface that makes promise #4 provable and turns the take-rate from a cost into a receipt.

---

## Phase 6 — Public rebrand & marketing · XL

Goal: the Community Collective narrative and the four promises, site-wide. See **§B** for the funnel-by-funnel nuance.

| Surface | Change | Tag |
|---|---|---|
| `lib/site.ts` | The single upstream tagline/description. "A place to be human" → the Community Collective line. Ripples into homepage, llms.txt, JSON-LD. | S ✏️ |
| `app/page.tsx` | 38 KB manifesto homepage: rewrite hero to the Collective positioning; fix the hardcoded "$10 Crew" line. | XL ✏️ |
| `app/(marketing)/pricing/page.tsx` | Add Collective + the two-world model; rewrite value-prop + FAQ; the four promises. | XL ✏️ |
| `lib/marketing/personas.ts` | 5 persona doors; hand-edit the hardcoded "$49/$29/$20" (won't reflow from catalog). | L ✏️ |
| `lib/marketing/funnel-config.ts`, `app/for/[niche]/page.tsx`, `components/marketing/funnel/*` | Collaboration-first door copy; new tier vocabulary; add persona configs (studios/hosts/communities/nonprofits). | L ✏️ |
| `app/(marketing)/vs/*`, `the-community`, `what-is-frequency`, `start`, `founders`, ~16 SEO guides | Competitive + positioning sweep ("we don't tax your bookings"). | M ✏️ |

Dependency: can start after Phase 0; finalize prices after Phase 1. OFF note: marketing copy is not gated by `billing_live`; sequence the public rebrand to land with go-live so live copy and live pricing agree.

---

## Phase 7 — SEO / AIO · M

| Surface | Change | Tag |
|---|---|---|
| `app/llms.txt/route.ts` | AIO-critical: rewrite the brand summary + pricing block (partly hardcoded). | ✏️ |
| `lib/jsonld.ts` | Org description + Product/Offer/FAQPage schema to the new tiers; verify tier→schema-type map. | ✏️ |
| `app/sitemap.ts`, `generateMetadata` (pricing + `/for`), OG/Twitter art | New routes; metadata sweep; rebrand visuals if art changes. `llms-full.txt` reflows from help edits. | ✏️ |

Dependency: Phase 6.

---

## Phase 8 — Infographics & lead funnel · L

Eight infographics (house tokens, inline SVG, responsive, reduced-motion, registered as Loom elements):
(1) the value ladder, (2) "we only earn when you do", (3) in-collective vs standalone, (4) the collaboration
flywheel, (5) solo→collective continuum, (6) the mission & the buildings, (7) the four promises, (8) the five
funnel doors.

The "join the Collective" funnel reuses the **existing** scan→cookie→attribute→convert loop with **no new
plumbing**: `app/q/[slug]/route.ts` + `lib/attribution/*` + `lib/qr/referral.ts` + `lib/crm/lead-capture.ts`
+ the config-driven `lib/marketing/funnel-config.ts` template. Register a Growth-OS funnel per niche
(view → CTA → account → Space → first network-sourced sale). See §B.

Dependency: Phase 6.

---

## Phase 9 — Help center & go-live · M

- Rewrite the ~22 help articles that mention pricing/plans/membership (load-bearing:
  `content/help/membership/the-vault.md`, `the-gem-store.md`, `partners.md`, `spaces/space-crm.md`, plus the
  getting-started + Quest-access mentions). Help content reflows into `llms-full.txt` automatically.
- `docs/CHANGELOG.md` + member changelog.
- **Go-live checklist:** sync the catalog to Stripe (admin, env-gated) → verify prices → flip `billing_live`
  + the Collective beta flag + per-tier enables. Advisors clean, tests green.

---

## §A — The differential take-rate (deepest design)

The single hard build. Today `lib/billing/fees.ts` resolves a rate purely from `plan` + paying-state; there is
**no concept of where a sale came from**. The new rule needs three layers:

1. **Attribution at order creation.** Every commerce order records a `source ∈ {self, network}` (+ optional
   `attribution_ref`). Classification uses the already-live signals: an order carrying a network entry-point
   (a `fq_ref` referral, a discovery/marketplace click-through, a cross-space share) is `network`; a direct
   booking on the operator's own page is `self`. **Default to `self` on any ambiguity** (we never want to
   charge a fee we promised not to).
2. **Source-aware fee math.** `spaceTakeRateCents(gross, plan, {source})`: `self → 0 bps`; `network → the
   plan's network bps` (Member ~1000 / Crew ~800 / Business ~500 / Collective ~300 / Non Profit ~0). A
   disconnected (Independent) space is `self` by definition (it left the graph) and pays the flat price only.
3. **Provable receipt.** Phase 5 reads the same attribution back to show "$ the network earned you", so the
   fee is auditable by the member, which is what makes the take-rate feel like a partner's commission
   instead of a tax.

Call sites to thread `source` through: `lib/commerce/checkout.ts` (L63-81 profile-vs-space branch),
`lib/commerce/orders.ts`, `lib/billing/tickets.ts`, `lib/billing/tips.ts`. Pure math + classification is
unit-tested; adversarial tests assert a self-booking can never be billed a network rate.

## §B — Marketing funnel nuance (how each funnel works, and what changes)

- **The five persona doors** (`/for/<niche>`, `lib/marketing/personas.ts` + `funnel-config.ts`): one
  chrome-free template, config per niche. Only `coaches` is live. Rebuild copy collaboration-first ("grow
  alongside other <niche>"), swap the tier vocabulary to the six tiers, hand-edit the hardcoded prices, and
  add the four missing configs (studios / hosts / communities / nonprofits). CTA becomes **"Join the
  Collective free."**
- **The Start-free bridge** (`docs/OPERATOR-FUNNELS.md`): deferred-auth signup → seed a Space in the niche's
  mode → land in the editor, attribution carried through. Unchanged mechanically; copy + the "you're now in
  the Collective" moment are new.
- **The splash lane** (`lib/qr/splash.ts`, `app/q/[slug]/route.ts`): the in-person scan-time "join us" moment
  for events/venues. A "join the Collective" splash template is a config addition, no new plumbing.
- **The referral loop** (`lib/qr/referral.ts`, `fq_ref`): "[Name] invited you to the Collective"
  personalization + the existing Zap reward. This loop is *also* the primary network-source signal for §A, so
  it does double duty (growth + take-rate attribution).
- **Comparison pages** (`app/(marketing)/vs/*`, `lib/marketing/comparisons.ts`): re-angle against Mindbody /
  Circle / Momence around the four promises (esp. "we don't tax your bookings").
- **Measurement**: register a Growth-OS funnel object per niche on the first-party ledger + GA4:
  page_view → cta_click → account.created → space.created → **first network-sourced sale** (the true
  activation metric for this model).

## §C — Migration ledger (all additive, ship OFF)

1. `commerce_orders.source` (+ `attribution_ref`) — network-sourced attribution (Phase 2, the largest add).
2. CHECK-constraint swaps: `profiles.membership_tier` (add tiers if the personal axis grows),
   `space_subscription_items.item_key` (add `collective`, `independent`).
3. `spaces.plan` new values — free-text, no migration; app-side `SPACE_PLANS` + remap only.
4. `pricing_settings` / `pricing_stripe_prices` — Collective beta + Independent price rows (kv, seed).
5. `network_connected` — column exists; no schema change, only new consuming logic (Phase 3).

## §D — Research appendix (basis for the model)

Four research streams underpin every decision here:
- **Creator/community platforms:** the market splits subscription-led (take-rate → 0%) vs take-rate-led
  (~10%). Nas.io's "pay to buy down your rate" is the cleanest hybrid; a monthly floor with no revenue is the
  #1 churn driver; Substack owns discovery to justify 10% with zero feature gates.
- **Wellness vertical:** solo healers are cash-poor (41% under $10K/yr); the market hates add-on creep,
  lock-in, and take-rate on core bookings; the loved tools (Punchpass, OfferingTree) are flat + 0% platform
  fee; no one serves the solo→collective continuum.
- **Value/network monetization:** value-based pricing beats cost-plus by 30-40%; a % is "loss-shared" (a
  partner's commission) while a lock is "loss-imposed" (a toll); Gumroad takes ~10% self / ~30%
  network-sourced; Shopify scales the % down as the subscription goes up; healthy mix ~50-65% recurring.
- **Mission & buildings:** patronage converts ~1-10% (model on 10%, push recurring "sustaining"); guilt
  suppresses participation; fund physical spaces via a separate community-owned vehicle (community shares /
  Reg CF), not platform margin; each venue self-funds on multi-stream economics.

## References

[COMMUNITY-COLLECTIVE-STRATEGY.md](COMMUNITY-COLLECTIVE-STRATEGY.md) · [ADR-811](DECISIONS.md) ·
[NAMING.md](NAMING.md) · [CONTENT-VOICE.md](CONTENT-VOICE.md) · [PRICING.md](PRICING.md) ·
[COLLABORATION-AND-UPGRADE-FUNNEL.md](COLLABORATION-AND-UPGRADE-FUNNEL.md) · [OPERATOR-FUNNELS.md](OPERATOR-FUNNELS.md) ·
[SPACES.md](SPACES.md) · [BUSINESS-MODEL-PLAN.md](BUSINESS-MODEL-PLAN.md)
