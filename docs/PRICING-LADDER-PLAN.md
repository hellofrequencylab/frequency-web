# Pricing & Value Ladder — implementation plan (Crew · Pro · Nonprofit · Organization)

> **The answer, first.** The owner-approved value ladder (Notion: "Pricing & Value Ladder, Draft for
> Review", 2026-06-30) is **~80% a repackaging of the entitlement engine already shipped**
> ([PRICING.md](PRICING.md), ADR-362/363/364/370/373), not a rebuild. This doc is the git source of
> truth for the technical model + the phased build; the Notion page stays the strategy view and links
> back here (per [DOCS-PROTOCOL.md](DOCS-PROTOCOL.md)). **Everything ships behind `billing_live` OFF;
> the flip is one switch at the end.** Decision: ADR-458.

## 1. The target model

> **Refined by §1b (2026-06-30):** the Space plan axis is now **four first-class tiers** (Pro · Business ·
> Non-profit · Organization) with the four add-ons folded into tier depth (AI stays metered). Read §1b for
> the live model; §1 below is kept for the axis overview + the consolidation history.

Access is the **union of independent axes** (a person can hold several at once):

| Axis | Values | Bought / earned |
|---|---|---|
| **Membership** (personal) | Visitor · Member (free) · **Crew** ($9) | self-serve billing |
| **Stewardship** (community) | Member · Host · Guide · Mentor | **earned, never paid** (ADR-207, unchanged) |
| **Space plan** (entity) | **Pro** · **Nonprofit** · **Organization** | self-serve / sales-assist |
| **Space role** (per Space) | viewer < editor < moderator < admin < owner | granted by owner |
| **Platform staff** | Janitor · Admin · Operations · Marketing · Accounting · Support · Analyst | top-down |

**Commercial pricing page shows three tiers (Pro · Nonprofit · Organization); Crew lives on the
personal upgrade page.** Three is the conversion sweet spot.

| | Crew | Pro | Nonprofit | Organization |
|---|---|---|---|---|
| For | individuals | practitioner/coach/small business | verified 501(c)(3) | enterprise / multi-space |
| List price | $12/mo | $29/mo + add-ons | $15 / seat / mo | from $249/mo |
| **Founding price** | **$9/mo** | **from $19/mo** + add-ons | **$12 / seat / mo** (licensed) | **from $199/mo**, custom |
| Model | personal membership | low base + 4 toggle add-ons | all-inclusive, per-seat | sales-assist, anchored |
| Take-rate | — | 5% | 3% | custom |

**Pro = strong core + exactly four add-ons** (each toggles on/off, 14-day in-product trial, prorated):

- **Pro core ($19):** Branded Space site · QR Studio · Bookings & availability · Tickets · Enrollment ·
  Check-in · Donations · Memberships (Stripe Connect) · **CRM** (pipeline/contacts/notes) · basic analytics.

| Add-on | Turns on | Price | Activation trigger |
|---|---|---|---|
| 🎯 Marketing | Email · Automation/nurture · multi-pipeline · reporting | +$20/mo | opens the email/Dispatch composer |
| 🧠 AI Engine | Resonance read-only → Resonance AI (graph, predictive, managed matching) + autonomy dial | +$20/mo | CRM crosses ~N contacts |
| 👥 Team | extra operator seats + roles | +$9 / seat / mo | invites a 2nd operator |
| 🎨 Branding | custom domain + remove Frequency branding (white-label) | +$30/mo | shares the Space link externally |

Loadouts: practitioner $19 · coach (+Mkt) $39 · small business (+Mkt+AI) $59 · everything $69 + seats.
Nonprofit + Organization get all four included.

**Consolidations from today's model:**
- 7 space plans (free/practitioner/partner/nonprofit/business/organization/whitelabel) → **3** (pro/nonprofit/organization). **Space type ≠ plan**: `spaces.type` (practitioner/coaching/business/event_space/lab/partner) stays as identity/skin; **all business types run on Pro**.
- **Partner** → comped Pro account (operator-assigned + rev share), never public.
- **White-label** → the **Branding add-on**, not a plan.
- **Supporter** → retired as a tier; becomes an optional pay-what-you-want "Supporter" badge on Crew.

## 1a. Founding price + grandfather lock + annual + mission framing (owner strategy, 2026-06-30)

Every published price ships as a **list anchor** with a lower **founding price** beneath it. The founding
price is the real price today; the list price is the visible anchor it sits under (Pro reads
"~~$29~~ **$19/mo**, founding price"). This reframes the offer as a deal a member is early enough to catch,
not a discount we are begging with.

- **Grandfather for life.** A member who subscribes at the founding price **keeps that price for as long as
  the account stays subscribed**, even after the list price rises. This **reuses the existing price-lock
  mechanism** (`profiles.locked_price_id` + `is_founding_member`, ADR-363, today scoped to the Founders
  Round) generalized to space plans + add-ons: the concrete Stripe price id charged at first subscribe is
  recorded per subscription item, and renewals + add-on toggles re-bill against the **locked** price id, not
  the current list price. A lapse that cancels the subscription ends the lock; re-subscribing later pays the
  then-current founding (or list) price. No separate "founder plan", it is the same Pro/Nonprofit/Org item at
  a locked price id.
- **Annual option, framed as backing the build.** Each plan + add-on offers a **yearly** Stripe price
  (interval `year`) beside the monthly one, priced as **two months free** (10 months for 12). The annual CTA
  is the "back the build" path: paying for the year up front is the member putting real weight behind the
  mission, and it is the strongest founding-price lock (a full year held at the founding rate). Monthly stays
  the low-friction default; annual is the conviction option.
- **Mission framing (membership funds the work).** The upgrade + pricing copy says plainly what the money
  does: a paid plan keeps Frequency independent and pays for the people and infrastructure that run it, so
  members are funding the vision and the day-to-day operations, not buying software. Voice rules still bind
  (CONTENT-VOICE §10): state what the membership funds in plain, concrete terms; never narrate the reader's
  feelings, never imply guilt, pass the skeptic test, no em dashes. The founding price + the annual "back the
  build" option carry the inspiration; the sentences stay plain.

**What this adds to the build:** a `list_price` anchor + a `founding_price` per published price in the
pricing catalog (`pricing_stripe_prices` / `pricing_settings`); a monthly + yearly Stripe price per item; a
per-subscription **locked price id** on space subscriptions (mirroring `profiles.locked_price_id`) so renewals
honor the grandfathered rate; the anchor + founding + annual display on every price surface; and the
mission-framing copy on the pricing + upgrade pages. Folded into Phase B (Stripe + lock) and Phase F
(anchor display + mission copy) below. Still ships behind `billing_live` OFF.

## 1b. Tier × Mode re-strategization (owner direction, 2026-06-30) — SUPERSEDES the §1 add-on framing

The Space plan axis moves from "**Pro + four toggle add-ons**" to a clean ladder of **four first-class
tiers**, each wearing a curated set of **Modes**. This refines §1: the four tiers replace the
Pro-plus-toggles table; the founding-price / grandfather / annual / mission machinery in §1a is unchanged and
applies to every tier.

### The two threads

A Space is always **one Tier × one Mode**. They are orthogonal:

- **Tier** is the COMMERCIAL thread: what you pay, how many seats, and how DEEP the function goes. It is the
  `spaces.plan` value and drives the entitlement depth set (`entitlements.billing`, the `setSpacePlan`
  machinery already shipped).
- **Mode** is the OPERATING thread: how the Space runs, its design LAYOUT, and which features lead. It is
  `spaces.type` + `mode_variant` (the `ModeProfile` registry, ADR-461/464). Mode is free framing, never a gate.

**Best-practice principle (owner-set): never gate the core value, gate depth + seats.** Every tier can do
**any money exchange** (bookings, payments, donations, tickets, memberships, products). What you pay for is
DEPTH (advanced CRM, marketing automation, branding, governance) and SEATS (team). This keeps the entry tier
genuinely useful and makes each upgrade a clear, single trigger.

### The four tiers

| Tier | Who | Seats | Depth of function | Modes surfaced | Price posture |
|---|---|---|---|---|---|
| **Pro** | Solo operator who monetizes | **1** | Any money exchange + CRM-lite + basic analytics; marketing automation / white-label / team **capped** | Practitioner · Coaching · Creator | Founding **$19** / list $29 |
| **Business** | A team running a real operation | **Multi** (licensed) | **Full** depth: every tool, marketing automation, full CRM, team roles, custom domain | + Business · Studio · Event space (all modes) | base + per-seat |
| **Non-profit** | Verified mission orgs | **Multi** | **Full** (= Business) + donation/volunteer/grant framing forward | Organization · Community forward, all available | discounted Business + licensed seat |
| **Organization** | Large / complex orgs | **Multi** (high) | **Expanded + custom**: white-label, custom Modes, advanced governance/roles, SSO-grade controls | all + **Custom mode** · Lab | custom / contact, anchored floor |

### Where the four old add-ons go (decision: fold into tier depth; AI stays metered)

| Old add-on | New home |
|---|---|
| 👥 **Team** | Intrinsic to the multi-seat tiers (Business/Non-profit/Org). The Pro→Business jump IS the team jump. Not a toggle. |
| 🎯 **Marketing** | Folds into **depth**: Pro gets basic email/broadcast; Business+ unlock automation/nurture/multi-pipeline/reporting. |
| 🎨 **Branding** | Folds into **depth**: Pro gets accent + logo; Business gets custom domain; Organization gets full white-label + custom. |
| 🧠 **AI Engine** | **Stays a cross-tier metered add-on** (usage-priced). AI cost scales with use, so it is honest to meter it apart from the tier base, available on every paid tier. |

### How it threads with what is already built (evolution, not teardown)

- **Plan values:** add `business` to `SPACE_PLANS` → `['free','pro','business','nonprofit','organization']`
  (`lib/pricing/plans.ts`). The legacy remap (`business → pro`) is retired for NEW spaces; existing rows
  re-map forward. The depth sets become `PLAN_ENTITLEMENT_KEYS` per tier (Pro = capped core; Business/Non-profit
  = full; Org = full + expansions). AI keys move to a metered add-on key, not a tier toggle.
- **Modes:** the `ModeProfile` registry gains the curated per-tier sets + an Organization-only **Custom mode**.
  A tier exposes only its set in the create wizard + Mode settings (framing only; switching never changes a gate).
- **Stripe:** four base products (Pro / Business / Non-profit / Organization) on the existing multi-item-sub +
  per-seat machinery; monthly + annual per item; founding-price lock per item (§1a) unchanged. AI add-on is a
  metered price.
- **Commercial page:** shows the four tiers (Pro · Business · Non-profit · Organization); Crew still lives on
  the personal upgrade page. Per-Mode marketing (Phase F) re-frames around the tier each Mode lives in.

### The recommended calls baked in here (flip any)

1. **Add-ons → tier depth**, with **AI Engine the one metered exception**.
2. **Pro is solo (1 seat)**; multi-seat is the Business jump.
3. **Curated Modes per tier** (Pro: solo modes; Business: all; Org: all + Custom).

## 2. Owner-decided open questions (locked for this build)

| Question | Decision |
|---|---|
| Supporter | Retire as tier → PWYW Supporter badge on Crew. |
| Partner | Comped Pro account, never public. |
| Add-on bundling | multi-pipeline + reporting live inside **Marketing**. |
| Nonprofit seats | **$12 licensed-seat**, 3% take, 3-seat bundled floor. (Active-seat true-up is a v2.) |
| Organization | Keep the published **$199 floor anchor**. |
| Anchor + founding price | Every price ships as a **list anchor** (Pro $29) with a lower **founding price** (Pro $19) shown beneath it. |
| Grandfather | Founding price is **locked for the life of the subscription** (reuse `locked_price_id`/ADR-363, generalized to space items); a lapse ends the lock. |
| Annual | Each plan + add-on offers a **yearly** price at **two months free** (10 for 12), framed as "back the build"; monthly stays the default. |
| Framing | Membership **funds the mission + operations** (independent, pays the team + infra). Plain voice, no guilt, skeptic-test (CONTENT-VOICE §10). |

## 3. The keystone architectural change (do FIRST) — entitlement partition

Today `setSpacePlan` only **expands** `spaces.entitlements` additively (manual grants survive). Add-ons
that **toggle off** must **remove** keys. So partition the blob:

- `spaces.entitlements` keeps a **billing-managed namespace** (e.g. `entitlements.billing.<key>`) written
  **only** by the webhook/plan resolver, and **manual grants** stay in the existing top-level keys.
- `spaceHasEntitlement(key)` reads the union; toggling an add-on off removes only its billing-managed keys,
  never a hand-grant. A client can never forge a billing key (service-role writes only).
- `setSpacePlan`/`setSpaceAddons` become **set-to-target** (compute the exact billing key set from
  base plan + active add-on items, then replace the billing namespace), not append-only.

Everything downstream (add-on toggles, downgrades, Nonprofit/Org all-included) depends on this.

## 4. Coverage by dimension

### Database + migrations (additive, reversible, ship OFF)
| Migration | What |
|---|---|
| `pricing_plan_collapse` | remap `spaces.plan` to `free/pro/nonprofit/organization` (practitioner/business → pro; whitelabel → pro + branding key; partner → pro + `is_comped`); add `spaces.is_comped`. Backfill the billing-namespace entitlements from each space's current plan so behavior is identical. |
| `pricing_addons` | `space_subscription_items` (space_id, item_key ∈ {base,marketing,ai,team,branding}, stripe_subscription_item_id, status, trial_ends_at, quantity). |
| `pricing_seats` | seat model: `spaces.seat_quantity` (licensed) + a derived active-seat count from `space_members`; index. |
| `pricing_member_tier` | collapse `membership_tier` → `free/crew`; `profiles.is_supporter` + optional PWYW contribution record. |
| `pricing_keys` | new `pricing_settings`/`pricing_stripe_prices` keys: `pro_base`, `addon_marketing`, `addon_ai`, `addon_team`, `addon_branding`, `nonprofit_seat`, `organization`; archive retired keys (practitioner/business/whitelabel/supporter) without deleting history. Each price key carries a **list** and a **founding** amount + a **monthly** and a **yearly** Stripe price id. |
| `pricing_price_lock` | per-subscription **locked price id** on space subscriptions (e.g. `space_subscription_items.locked_price_id`, mirroring `profiles.locked_price_id`/ADR-363) so renewals + add-on toggles re-bill the grandfathered founding rate, not the current list price. |

### Stripe
- **Pro = one subscription, multiple items** (base + one price item per active add-on); add/remove item with proration + 14-day trial on the item.
- **Team + Nonprofit = quantity (per-seat) items** (licensed seats v1; owner sets quantity; predictable proration).
- Extend `lib/billing/space-subscriptions.ts`: on `subscription.updated` read **all** items, map each `item_key` → entitlement keys, **set-to-target** the billing namespace.
- **Founding price grandfather.** Each item carries a **list** and a **founding** Stripe price; checkout uses the founding price and records the charged **locked price id** per subscription item (generalize `profiles.locked_price_id`/ADR-363). `subscription.updated`/renewal + add-on toggles re-bill the **locked** price, so a member who joined at the founding rate keeps it until the subscription lapses. A new subscribe after the lock ends pays the then-current price.
- **Annual prices.** Every plan + add-on has a **monthly** and a **yearly** Stripe price (interval `year`, two months free); the picker switches the whole loadout monthly/yearly, and the lock applies to whichever interval was bought.
- Connect destination charge + application fee (5/3/custom) unchanged; founder lock honored.
- `pricing-products.ts` syncs the new Product/Price catalog (base + add-ons + nonprofit seat + org), **each with a list + founding amount and a monthly + yearly price**, admin-triggered only, env-gated, idempotent.

### Surfaces (rewrite)
| Surface | Change |
|---|---|
| **Commercial pricing page** (new/rewrite, public) | 3 tiers (Pro/Nonprofit/Org), value-based, static (ISR), `Product`/`Offer` + `FAQPage` JSON-LD. **List anchor with founding price beneath** ("~~$29~~ $19, founding price"), a **monthly/yearly toggle** (annual = two months free, "back the build"), and the **mission-framing** line (membership funds the mission + operations). |
| **Personal upgrade** (`/upgrade`) | Crew only (list $12 → founding $9); Supporter PWYW badge; drop Supporter tier; same anchor + annual + framing. |
| **Space plan + add-on picker** (`/spaces/[slug]/settings/billing`) | Pro base + 4 add-on toggles with a **live loadout total**; **monthly/yearly switch**; founding price shown under the list anchor; a member already on the founding rate sees their **locked price** held; trials; per-add-on CTA; OFF → disabled preview. |
| **`/admin/pricing`** | add-on bundles + prices + per-add-on enable + Stripe item sync; seat config; PWYW config. |
| **In-context upsell teases** | the 12 threads; wire-first 1 (Contacts→CRM), 2 (QR→Studio), 4 (Practice→Programs), 6 (Earn→Cash-in), 7 (Vera depth) at the success moment. |
| **Marketing/SEO pages** | rewrite pricing + persona loadout landing pages ("Frequency for Coaches $39", "for Small Business $59"), tie into GE11 comparison/alternative-to pages. |

### Roles
- Stewardship earned/unpaid (unchanged). **Creation/hosting/authoring → Crew+**: author Practice/Journey, create Circle/Event, become Host gate on the Crew tier **server-side** in each create action (capability resolver), in addition to role. Space role × plan double-gate (already exists).

### Security · Speed · SEO/AIO
- **Security:** server-side Crew gate on create actions; add-on features default-deny via `featureAllowed`; seat limit enforced server-side on invite; billing-managed vs manual entitlement partition (no forge, no toggle-off nuking grants); all dormant behind `billing_live`; webhook-only billing writes.
- **Speed:** entitlement resolution stays a single jsonb read (no N+1 on the picker); loadout math pure/client; commercial pricing page fully static, zero per-request billing reads.
- **SEO/AIO dominance:** static pricing page + JSON-LD (`Product`/`Offer`/`FAQPage`); per-loadout persona landing pages (high-intent); `llms.txt` describes the ladder for answer engines; tie into GE11.

## 5. Phases (each a wave, ships OFF behind `billing_live`)

| Phase | Scope | Migration | Depends on |
|---|---|---|---|
| **A · Keystone** | entitlement partition + `setSpaceAddons` set-to-target + plan-collapse migration + member-tier collapse | yes (collapse + member_tier) | — |
| **B · Stripe** | add-on subscription items + per-seat quantity items + webhook set-to-target + product/price sync + **founding-price grandfather (locked price id) + monthly/yearly prices** | yes (addons + seats + keys + price_lock) | A |
| **C · Surfaces** | Space plan+add-on picker (live loadout, **monthly/yearly switch, founding-under-anchor, locked-price held**) + Crew upgrade (Supporter PWYW) + `/admin/pricing` add-on + **list/founding/annual** config | no | A, B |
| **D · Seats** | licensed per-seat billing (Team + Nonprofit), invite seat-limit enforcement | no | B |
| **E · Threads** | the 5 wire-first in-context upsell teases | no | C |
| **F · Pages/SEO** | commercial pricing page rewrite (**anchor + founding + annual + mission framing**) + persona loadout pages + JSON-LD + llms.txt | no | C |

Gate to flip live: all phases merged, advisors clean, Stripe products synced, then an operator sets keys
+ flips `billing_live` + per-tier/add-on switches.

---

*Owner: Daniel (Vision Steward). Created 2026-06-30. Source of truth for the pricing overhaul; supersedes
the per-plan model in PRICING.md as phases land (PRICING.md updated per phase). Notion strategy page links here.*
