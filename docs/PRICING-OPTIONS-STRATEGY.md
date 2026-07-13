# Creator Pricing Options — best-practice strategy

> **Scope.** This is about what a creator **charges** for their offerings (products, services,
> tickets, bookings, memberships, giving) — NOT what a creator **pays** Frequency for their plan.
> The subscription ladder lives in [PRICING.md](PRICING.md) / [PRICING-LADDER-PLAN.md](PRICING-LADDER-PLAN.md)
> and is untouched here. Two different pricing systems; do not conflate them.

## The answer up front

Give every sellable thing **one shared "Price Mode" control** with progressive disclosure, so a
first-timer sees a single price field and a power user has every lever behind it. Four modes plus two
switches cover the entire request:

| Control | What it is | Covers the ask |
|---|---|---|
| **Fixed** | One set price. | the default |
| **Choose your price** | Buyer names the amount, with a **suggested anchor** (required) and an **optional floor**. | variable pricing, "choose your own price", PWYW, sliding scale |
| ☑ **Donation based** | A *checkbox on Choose-your-price*: reframes the offer as a gift and shows a **range of quick-pick amounts** (floor → suggested and beyond). | the "Donation Based" checkmark that enables a range |
| **Free** | No charge. | free offerings |
| **Enquire** | No checkout, a contact button. | consult-first services |
| ➕ **Add option (Packages)** | Promotes one offer into a **Good / Better / Best** set; each option carries its own Price Mode. | package pricing |

That is the whole model. Everything else is where it plugs in and how it rolls out.

## Why this shape — the problem it fixes

Frequency already prices things in **three different vocabularies** that grew up separately. The
request is, in effect, a mandate to unify them:

| Surface today | Modes | Range fields | Packages | File |
|---|---|---|---|---|
| **Event ticket tiers** | `fixed · free · pwyc · sliding_scale · donation` | `min_cents`, `suggested_cents` | named tiers | `lib/events/ticket-tiers.ts` |
| **Commerce services** | `fixed · from · free · contact` (+ `slidingScale` bool) | none explicit | variants | `lib/commerce/types.ts` |
| **Donations** | implicit "pick an amount" | `suggestedAmountsCents[]` | n/a | `components/spaces/donations/donation-ask-form.tsx` |
| **Commerce products** | `fixed` (`priceCents`) | none | variants (`priceCents null` = inherit) | `lib/commerce/products.ts` |

The **ticket-tier model is already the most complete** — buyer-chosen modes with a floor and a
suggested anchor — so it becomes the template the others adopt. Three insights collapse the list:

1. **PWYW and sliding scale are the same mechanic.** Both = "buyer names the price, guided by a
   suggestion, optionally floored." Sliding scale is just PWYW *with* a floor and framing. → one mode:
   **Choose your price**, with an optional minimum.
2. **Donation is Choose-your-price wearing charitable framing.** Same buyer-names-it mechanic, plus a
   gift narrative and a **range of quick-pick chips**. It should be a **checkbox on** Choose-your-price,
   exactly as the owner asked, not a separate mode. This also folds the standalone Donations
   suggested-amounts surface into the same primitive.
3. **Packages are just named options**, one of which is the default. That is variants / ticket tiers we
   already store — surfaced as **Good / Better / Best**.

## What the research says (and how we honor it)

Pay-what-you-want and tiered pricing are well studied. The findings map directly onto guardrails:

| Finding | Source | Our guardrail |
|---|---|---|
| A **suggested anchor** is the single biggest lever in PWYW; without one, payments crater and some buyers walk. | [Competera](https://competera.ai/resources/glossary/pay-what-you-want-pricing), [Orb](https://www.withorb.com/blog/price-anchoring) | **Suggested price is required** whenever Choose-your-price is on. No anchorless PWYW. |
| A **charitable component** lifts contributions materially (one field study: avg payment $0.92 → $5.33 when half went to charity). | [Wikipedia: PWYW](https://en.wikipedia.org/wiki/Pay_what_you_want) | Make the **Donation framing prominent** (fund label, "where gifts go") — the charity hook is the point of the checkbox. |
| A **floor** protects against paying-too-little; optional but valuable for paid work. | [Competera](https://competera.ai/resources/glossary/pay-what-you-want-pricing) | Floor is **optional**; encouraged for services (protects a practitioner's rate), defaults to $0 for donations (a gift can be any size — the chips anchor instead). |
| **Three tiers** is the sweet spot; 24 options cut purchase rate ~10x vs 6 (the jam study). | [InfluenceFlow](https://influenceflow.io/resources/creator-tier-levels-the-complete-2026-guide-to-platform-strategies-pricing-psychology-and-growth/), [Simon-Kucher](https://www.simon-kucher.com/en/insights/mastering-tiered-pricing-strategy-revenue-maximization) | **Cap packages at 3–4**; the picker never sprawls. |
| **Good / Better / Best** with the **middle** as the default carries the healthiest margin and wins most buyers; the top tier anchors perception downward. | [Matt Haycox](https://matt-haycox.com/pricing/tiered-pricing/), [Stripe](https://stripe.com/resources/more/tiered-pricing-101-a-guide-for-a-strategic-approach) | Package editor **highlights the middle option ("Most popular")** and orders low→high so the top anchors. |
| PWYW as a *permanent* default trains customers to underpay; it shines for launches, digital goods, fundraising, loyal audiences. | [Competera](https://competera.ai/resources/glossary/pay-what-you-want-pricing) | Keep Fixed the **default**; Choose-your-price is an opt-in the creator turns on deliberately. |

## The unified primitive

One shared type, replacing the three divergent ones. It reuses the ticket-tier field names
(`min_cents` / `suggested_cents`) so most of the plumbing already exists:

```
PriceMode = 'fixed' | 'choose' | 'free' | 'contact'

Price {
  mode: PriceMode
  amountCents?: number       // fixed
  suggestedCents?: number    // choose — REQUIRED (the anchor)
  minCents?: number          // choose — optional floor
  donation?: boolean         // choose — the "Donation based" checkbox
  pickAmountsCents?: number[] // choose+donation — the quick-pick chip range
}

Offering {
  price: Price               // the single offer …
  options?: OfferingOption[]  // … OR a Good/Better/Best set, each with its own Price + a `recommended` flag
}
```

- **`pwyc` and `sliding_scale` → `choose`.** Sliding scale is `choose` with a `minCents`.
- **`donation` → `choose` + `donation: true`.** The chips come from `pickAmountsCents` (today's
  `suggestedAmountsCents`).
- **`from` (services) → `options`** (a package set), which is more honest than a bare "from".
- Read-time narrowing keeps every existing row valid — same trick `asSpacePlan` uses for legacy plan
  labels — so **no data migration is required to ship**.

## "As simple as possible, with all the options" — progressive disclosure

The power/simplicity tension is resolved by **disclosure, not by hiding features**. The creator sees
depth only after opting into it:

1. **Default:** a single **price field**. That is Fixed. Most creators stop here and never see a mode.
2. **A "Pricing" dropdown:** Fixed · Choose your price · Free · Enquire.
3. **When "Choose your price" is picked:** reveal **Suggested** (required) and **Minimum** (optional),
   plus the ☑ **Donation based** checkbox.
4. **When ☑ Donation based:** reveal a **fund label** and **quick-pick amounts** (the existing donations
   UX), and the copy flips to gift framing.
5. **An "➕ Add option" button:** promotes the single offer into a **Good / Better / Best** set; each
   option keeps the same tiny dropdown, and the middle is marked **Most popular** by default.

A beginner touches one field. A power user reaches every lever — variable pricing, floors, donation
ranges, packages — but only down a path they chose. That is the whole design philosophy.

## Where it plugs into the spine (a field-map, not a redesign)

| Layer | Change | Effort |
|---|---|---|
| `lib/commerce/types.ts` | Add shared `PriceMode` + `Price` + `OfferingOption`; deprecate `ServicePriceModel`/`slidingScale` via a read-time map. | small |
| `lib/events/ticket-tiers.ts` | Collapse `pwyc`/`sliding_scale`→`choose`, `donation`→`choose`+flag; keep narrowing for stored rows. | small |
| Services (`market/service-actions.ts`) | `priceModel` gains `choose`; `slidingScale` bool becomes `mode='choose'` + floor. Deposit / cancellation policy unchanged. | small |
| Donations (`donation-ask-form.tsx`, `lib/spaces/donations.ts`) | `suggestedAmountsCents` becomes `pickAmountsCents` on a `choose`+donation offering; the fund editor becomes one instance of the shared control. | medium |
| Packages | `commerce_variants` / `event_ticket_types` already store named options; add a per-option `priceMode`. Render as Good/Better/Best. | medium |
| Gating | Unchanged — pricing is **config**; taking money stays behind `payoutsLive()` + `canTakePayments`. Setting a price never implies a charge (matches the existing "OFF preserves behavior" posture). | none |

## Rollout — three phases, money last

| Phase | Scope | Ships |
|---|---|---|
| **P1 — one control, config only** | The unified Price Mode + Donation checkbox + Packages editor across products / services / tickets / bookings / donations. Pure display + validation. **Nothing charges** (mirrors `billing_live` OFF). | the editor everywhere |
| **P2 — buyer render** | The buyer side: the PWYW input with anchor + floor validation, the donation chip picker, the Good/Better/Best selector with the middle highlighted. Still no live charge. | the storefront UX |
| **P3 — checkout wiring** | Money, behind `payoutsLive()` **and** `canTakePayments`: PWYW/donation charges, donation receipts, charitable framing routed through the voice primer (`lib/ai/voice.ts`). | live payments |

## The one-screen summary

- **One control** for every sellable thing: Fixed · Choose your price · Free · Enquire, plus **Packages**.
- **"Donation based" is a checkbox** on Choose-your-price that turns on a gift frame and a **range of
  quick-pick amounts** — exactly as asked, and it retires the separate donations surface into the same
  primitive.
- **Packages = Good / Better / Best**, capped at 3–4, middle marked "Most popular".
- **Simple by default, deep on demand** via progressive disclosure — a beginner sees one field.
- **A field-map onto the ticket-tier model we already have**, not a rebuild; no data migration to start.
- **Config is free; money stays gated** — nothing charges until `payoutsLive()` + `canTakePayments`.

## References

- Naming + framing must clear [NAMING.md](NAMING.md) + [CONTENT-VOICE.md](CONTENT-VOICE.md) (gift
  framing, no em dashes, skeptic test).
- Existing primitives: `lib/events/ticket-tiers.ts` (the template), `lib/commerce/types.ts`
  (`ServicePriceModel`, `ServiceConfig`), `lib/commerce/ticket-projection.ts` (buyer-chosen "from"
  price math), `components/spaces/donations/donation-ask-form.tsx` (the chip UX to reuse).
- Subscription pricing (what the creator pays): [PRICING.md](PRICING.md) — separate system.
