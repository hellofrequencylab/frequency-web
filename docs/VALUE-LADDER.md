# The Value Ladder — strategy, tier map, and the phased build

**Status:** 🔴 canonical as of 2026-07-30. This document SUPERSEDES the tier/rate strategy in
`docs/PRICING-LADDER-PLAN.md` §1–§1b. `docs/PRICING.md` remains the mechanical reference (three-flag
model, gate table, Stripe wiring); where the two disagree on WHAT a tier includes or WHAT it costs,
this document wins.

⚠️ It does **not** supersede `docs/PRICING-OPTIONS-STRATEGY.md`, which an earlier draft of this line
wrongly claimed. That document is about what a *creator* charges *their own* customers (price modes,
pay-what-you-want, sliding scale). This one is about what a creator pays *Frequency*. Two different
pricing systems that share a vocabulary; conflating them is exactly the mistake to avoid.

---

## The answer up front

Frequency charges for **the introduction, never the relationship**. Two sentences carry the whole model:

> **Never gate the transaction. Gate the repeat.**
> **Your list is your discount.**

A free Member can take money on day one. What they cannot do is take money *at scale, repeatedly,
without doing the work by hand.* Every paid rung buys back time and takes a slice off the rate. The
result is a ladder people climb because their own success pushes them up it, not because we put a
wall in front of the door.

| | Free Member | Crew · contribute what you want | Business Space · $29/mo | Collective · $79/mo | Non Profit · $39/mo |
|---|---|---|---|---|---|
| **Take rate, network-sourced** | 10% | 8% | 5% | 3% | 0% |
| **Take rate, your own audience** | **0%** | **0%** | **0%** | **0%** | **0%** |
| **Tips** | 0%, always | 0% | 0% | 0% | 0% |
| **Sell tickets** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Take donations** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Sell memberships** | ⛔ | ⛔ | ✅ | ✅ | ✅ |
| **Contacts** | your own list | your own list | unlimited Space CRM | unlimited + pipelines | unlimited |
| **Space CRM** | 200 contacts, basic messaging | 200 contacts | unlimited, campaigns, funnels | + automation, multi-pipeline | full |

Everything below is the reasoning, the exact per-feature map, the phased build, and the protocol for
checking the work.

---

## 1. The psychology we are actually using

Nine mechanisms, each named, each mapped to a specific surface. These are the standard, replicated
behavioural results — not growth-hacking folklore — and each one is used in the direction that makes
the product honest rather than the direction that makes the number go up this quarter.

| # | Mechanism | Source | Where we use it | The honest direction |
|---|---|---|---|---|
| 1 | **Value-metric pricing** — charge along the axis that grows with the customer's own success | Campbell / ProfitWell; standard SaaS pricing practice | Take rate + contact count + send volume | The customer only pays more when they have made more |
| 2 | **Endowed progress** — a partially filled meter is finished far more often than an empty one | Nunes & Drèze, 2006 | Every meter starts with real usage already in it (200 contacts, not 0) | We give the progress before we ask for anything |
| 3 | **Loss aversion** — losing X hurts about twice as much as gaining X pleases | Kahneman & Tversky, 1979 | Meters name what you already built ("your 187 contacts"), never what you lack | We never actually take anything away. Data is never deleted at a cap |
| 4 | **Goal-gradient** — effort accelerates as the goal gets closer | Hull 1932; Kivetz et al. 2006 | Upsell tooltips appear at 80% of a meter, not at 100% | The prompt arrives while there is still time to decide calmly |
| 5 | **Data gravity / IKEA effect** — you value what you built | Norton, Mochon & Ariely, 2012 | The CRM, the Journey, the member list | Export is always available. Gravity must be earned, not manufactured |
| 6 | **Anchoring + the compromise effect** — a three-option set pulls choice to the middle | Simonson & Tversky, 1992 | Free / Business / Collective on the pricing grid | The middle option is genuinely the right one for most Spaces |
| 7 | **Reciprocity** | Cialdini | 0% on your own audience, forever, on every tier | This is a real, permanent, unconditional give |
| 8 | **Effort reduction beats feature count** | Fogg Behavior Model | Every paid rung is framed as "stop doing this by hand" | We sell the hour back, not the checkbox |
| 9 | **Reverse trial** — full capability first, then the choice | Standard PLG practice | The beta grace window (`featureGatesLive`) | Everyone sees the ceiling before they are asked to buy it |

### The three dark patterns we explicitly refuse

🔴 These are non-negotiable and are enforced by tests, not just by intent.

1. **No hostage data.** A meter that is full stops NEW writes. It never hides, deletes, or locks
   read/export access to what is already there. (`docs/CONTENT-VOICE.md` skeptic test.)
2. **No fake scarcity.** No countdown timers, no "3 people are viewing", no invented seat counts.
   The only time-bounded number in the product is the beta founding rate, which is real.
3. **No paywalled exit.** Export, cancel, and downgrade are available on every tier at all times, and
   downgrading never destroys data.

### The single upgrade thesis

Free tiers fail in one of two ways. Either they are so generous nobody upgrades, or so crippled
nobody starts. The specific failure mode this product was heading for was the second one: a free
Member who wants to charge $10 a head for a house show, hits a paywall, and sends people to Venmo.
That is a permanent loss, because the transaction never touched Frequency and neither did the
contact.

So the wall moved. **Selling is free.** The rate is what differs, and the rate is beaten by having
your own list, and the tools that build your own list are what you pay for. A free Member selling to
strangers at 10% has a strictly better product than Venmo (a page, a checkout, a list that fills
itself) and a visible, self-interested reason to climb: every rung takes the rate down AND automates
the list-building that takes the rate to zero.

---

## 2. The rate ladder

### The rule

```
take_rate = buyerIsSellersAudience(buyer, seller) ? 0 : NETWORK_RATE[tier]
```

Audience is a **relationship, proven by a row with a timestamp** — a follow, an active membership, a
CRM contact, a personal contact, or a prior settled purchase (`lib/commerce/seller-audience.ts`).
Not a cookie. A cookie cannot survive a phone-to-laptop switch and cannot answer a host asking "why
did you charge me for that sale?"

### The network rates

| Seller | Rate on a Frequency-sourced sale | Why this number |
|---|---|---|
| Free Member | 10% | The reference rate. High enough that the ladder has somewhere to go, low enough to beat doing it yourself once you count the page, the checkout, and the list |
| Crew (PWYW, from $4.99/mo) | 8% | At the $4.99 floor it pays for itself at ~$250/mo of network-sourced sales; at the $24.99 suggested amount, ~$1,250/mo. Deliberately reachable at either end |
| Business Space ($29/mo) | 5% | The rate a working small business can build on |
| Collective ($79/mo) | 3% | Near cost. A collective's volume is the point, not the rake |
| Non Profit ($39/mo) | 0% | Verified 501(c)(3). We do not take money from donations to a nonprofit |
| Independent (~$249/mo) | 0% | White-label and deliberately disconnected from the network, so there is no network-sourced sale for a rate to apply to |

⚠️ **Free Spaces are held to the free-Member standard: 10%.** A free Space is a real Space with real
limits, not a discount Business. It cannot sell memberships. It can sell tickets, take donations, and
receive tips.

### What is never charged

| Surface | Rate | Reasoning |
|---|---|---|
| **Tips** | 0%, all tiers, permanently | A tip is a gratuity between two people. The sender is by definition someone the recipient already earned, so charging it contradicts the promise the whole model rests on |
| **Donations** | 0% platform fee on nonprofit Spaces; network rate applies elsewhere only on sourced traffic | Same logic as tickets |
| **Anything to your own audience** | 0% | The promise |

Stripe's own processing fee is always passed through and always disclosed. We never describe a rate
as "0%" without the words "plus card processing" nearby in the same view.

---

## 3. The full feature map

Legend: ✅ full · ◐ metered/limited · ⛔ not on this tier

### Personal ladder (`profiles.membership_tier`)

| Capability | Member (free) | Crew (PWYW, from $4.99/mo) | The upgrade line |
|---|---|---|---|
| Create + publish events | ✅ unlimited | ✅ | |
| RSVPs | ✅ | ✅ | |
| **Sell tickets** | ✅ at 10% | ✅ at 8% | "Same tools. Lower rate." |
| **Take donations** | ✅ | ✅ | |
| Receive tips | ✅ 0% | ✅ 0% | |
| Payout account (Stripe Connect) | ✅ opened at first sale | ✅ | ⚠️ Reverses `personal_payouts` gate |
| Personal contact list | ◐ 200 | ✅ unlimited | "Your list is your discount" |
| Host a Circle | ◐ 1 | ✅ unlimited | |
| Publish a Journey | ◐ 1, unlisted | ✅ listed in the library | |
| Practices | ◐ 3 | ✅ unlimited | |
| Entry points (QR, short links, flyers) | ⛔ | ✅ | The list-building tool. This is the real Crew pitch |
| Vera | ◐ daily cap | ✅ uncapped | |
| Gems: earn | ✅ | ✅ | |
| Gems: spend / claim | ⛔ | ✅ | |
| Full rewards loop (streaks, seasons) | ◐ earn-only | ✅ | |

**Crew in one sentence:** *the rate goes down, the caps come off, and you get the tools that turn a
crowd into a list.*

#### Crew is CONTRIBUTE WHAT YOU WANT (owner decision, 2026-07-30; renamed from "pay what you want" by ADR-1084)

Crew has no price. The operator sets a **floor** ($4.99/mo), a **suggested** amount ($24.99/mo), and a
row of presets; the member picks any monthly amount from the floor up, and **every amount buys
identical access**. Annual is ten months of whatever they picked. Paying at or above the suggested
amount earns the **Supporter badge** (`profiles.is_supporter`) — recognition only, never access.

| Concern | Where it lives |
|---|---|
| The one operator control | `pricing_settings.catalog.pwyw` → `/admin/pricing` → "Member pricing (contribute what you want)" |
| The floor policy seam | `isValidPwywAmount()` (`lib/pricing/catalog-config.ts`), enforced server-side in `startMembershipCheckout` |
| The badge line | `earnsSupporterMark()`, same module |
| The charge | `createMembershipCheckout({ amountCents })` mints an inline recurring price at exactly that amount, under `STRIPE_PRODUCT_CREW` |
| What every display reads | `getPricingValues().tier.crew` is **derived** from `catalog.pwyw.minCents`, so there is no second editable Crew price that could disagree |

**Consequences, all deliberate:**

- Every member-facing figure reads **"from $4.99"**, never a bare `$4.99`. The prefix is applied at the
  single row builder (`memberTierRows`) and at `tierPriceLabel(axis === 'tier')`, so no caller can forget it.
- `amountCents` is **required** on both `startMembershipCheckout` and `createMembershipCheckout`. An
  optional amount implies a fallback price, and a fallback price for a priceless offer is exactly how a
  hardcoded `$9` got charged for a release.
- **The founding-member purchase path is removed.** A locked price is a promise about a fixed price, and
  there is no longer one to lock. Gone: `lib/billing/founders.ts` (the one-time Founders Round grant),
  its `kind: 'founders'` webhook branch, the `locked_price_id` read in the member checkout, the
  "Founder price lock" admin section + `setFoundingMember`, and the Founders Round rate editor. Zero
  profiles carried `is_founding_member`, so nothing was taken from anybody.
- **Grandfathered SPACE rates are untouched.** The three cash-paid Collectives on `founding_members`
  ($490/yr, ADR-880) and the Founding Business cohort are a different mechanism on the plan axis.

#### ✅ CLOSED 2026-08-24: the Market is open on the free tier (owner ruling, OWN-032)

~~**OPEN: two hard "you cannot sell" walls remain, and they contradict ADR-914.**~~ **Ruled and
removed, 2026-08-24.** The owner ruled that ADR-914's principle governs the Market too: **open the
Market to free members, leave the five Crew feature gates alone.** Three hand-rolled tier checks are
gone, and none of them was replaced by a gate key, because the ruling is that there is no wall here to
make visible.

| Wall | File | What it did | Now |
|---|---|---|---|
| The list-a-product page | `app/(main)/market/sell/page.tsx` | Rendered "Selling is a paid feature" instead of the editor | Signed in is the whole gate |
| The commerce action | `app/(main)/marketplace/commerce-actions.ts` | `redirect('/upgrade')` on create | Signed in is the whole gate |
| The Spark's Vera door | `app/(main)/marketplace/commerce-actions.ts` | `draftMakerProductCopyAction` returned empty copy to a free member | Signed in, with Vera's own daily cap unchanged |

The third was found by sweeping for the idiom rather than the two named lines. It existed for one
stated reason — it mirrored the paid gate on creating the product — so removing the creation gate and
leaving it would have left a Vera door that silently did nothing for the member who may now list.

**The rate does the work the wall was pretending to do.** `lib/commerce/checkout.ts` threads the
payee's real `membership_tier` into `memberTakeRateCents` → `memberNetworkTakeRateBps`, which resolves
a free seller to the `memberFree` rung (1000bps, 10%) and a Crew seller to `member` (800bps, 8%), with
`self`-sourced sales 0% on both. The lookup asks `isPaid`, an allow-list, so an unreadable tier prices
at the HIGHER free rung (ADR-914's deliberate fail-safe direction), verified 2026-08-24.

The lock is `app/(main)/marketplace/free-seller.test.tsx`: it runs the real page function and the real
server action against a free-tier profile and asserts what they DID, proven by mutation (re-adding
either wall fails it), plus the take-rate rungs and the five untouched Crew gates.

### Space ladder (`spaces.plan`)

| Capability | Free Space | Business ($29) | Collective ($79) | Non Profit ($39) | Independent (~$249) |
|---|---|---|---|---|---|
| Public Space page | ✅ | ✅ | ✅ | ✅ | ✅ |
| Events + RSVPs | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Sell tickets** | ✅ 10% | ✅ 5% | ✅ 3% | ✅ 0% | ✅ 0% |
| **Donations** | ✅ | ✅ | ✅ | ✅ 0% | ✅ |
| Storefront / shop | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Sell memberships** | ⛔ | ✅ | ✅ | ✅ | ✅ |
| Membership-gated tickets | ⛔ | ✅ | ✅ | ✅ | ✅ |
| Space CRM contacts | ◐ 200 | ✅ unlimited | ✅ unlimited | ✅ unlimited | ✅ |
| Messaging | ◐ basic, 300 sends/mo | ✅ 5,000/mo | ✅ 25,000/mo | ✅ 5,000/mo | ✅ |
| Campaigns + funnels | ⛔ | ✅ | ✅ | ✅ | ✅ |
| Multiple pipelines | ⛔ | ⛔ | ✅ | ✅ | ✅ |
| Automations | ⛔ | ◐ governed playbooks | ✅ full, 1,000 runs/mo | ✅ | ✅ |
| Team seats | ◐ 1 | ◐ 1 | ✅ 3 + per-seat | ✅ 3 | ✅ |
| Collaborator hosting | ◐ preview only | ◐ 3 | ✅ unlimited | ✅ | ✅ |
| Revenue splits | ⛔ | ⛔ | ✅ | ✅ | ✅ |
| Group SMS | ⛔ | ⛔ | ✅ | ✅ | ✅ |
| Bookings | ◐ 15/mo | ✅ | ✅ | ✅ | ✅ |
| Own brand + domain | ⛔ | ⛔ | ⛔ | ⛔ | ✅ |

### The three walls, and why each is a wall rather than a meter

Everything else is a meter. A wall is only justified where a quantity cannot express the difference.

| Wall | Floor | Why not a meter |
|---|---|---|
| **Sell memberships** | Business | A membership is a recurring promise to another person. Selling one on a tier you might abandon next month is a commitment we should not help someone make casually. This is the single most defensible wall in the product |
| **Campaigns + funnels** | Business | "One campaign free" teaches nothing and converts badly. The line is between *messaging your people* (free) and *running an acquisition machine* (paid) |
| **Revenue splits** | Collective | Automatic money-splitting between businesses is the collective's actual job. Hosting a few partners is Business; sharing revenue with them is the engine |

Everything else — contacts, sends, seats, collaborators, bookings, Circles, Journeys, Practices,
events, Vera — is a **meter with a real, usable free allowance**, because a used feature with a
ceiling converts, and a locked preview does not.

---

## 4. What has to change

An audit of the current code against the map above. Each row is a defect against the new canon.

| # | Where | Current state | Required |
|---|---|---|---|
| 1 | `lib/events/ticket-eligibility.ts` | Free Member blocked from selling tickets | Remove the block. Free Members sell at 10% |
| 2 | `FEATURE_GATES.event_paid_tickets` | `tier`/`crew` | Delete the gate |
| 3 | `FEATURE_GATES.personal_payouts` | `tier`/`crew` | Delete. Connect onboarding triggers at first sale |
| 4 | `FEATURE_GATES.space_crm` | `plan`/`business` **and** a 250 free meter | Contradiction. Gate becomes a 200-contact meter |
| 5 | `FEATURE_GATES.space_email` | `plan`/`business` **and** a 300 free meter | Contradiction. Gate the CAMPAIGNS, meter the SENDS |
| 6 | `FEATURE_GATES.space_membership_tickets` | `plan`/`collective` | Lower to `business` |
| 7 | Space memberships | ungated | New gate: `space_memberships`, `plan`/`business` |
| 8 | Campaigns + funnels | ungated | New gate: `space_campaigns`, `plan`/`business` |
| 9 | Rate table | two rungs | Five rungs, from `pricing_settings.take_rate` |
| 10 | `PLACEHOLDER_METER_LIMITS.space_crm` | 250 | 200 |
| 11 | Marketing pages | multiple disagreeing feature grids | One generated grid, one source |

---

## 5. The phased build

Nine phases. Each ships independently, each is verifiable on its own, and each leaves the product in
a shippable state. Phases 1–3 are behaviour, 4–6 are surfaces, 7–9 are proof.

### Phase 0 — Stop the clock 🔴 do this first, it is time-critical

The gates audit found a live fuse. **`pricing_settings.beta_grace` has no row in production.** The
code default is `{ until: '2026-09-01' }`, so `featureGatesLive()` flips to **true on 2026-09-01
00:00 UTC by itself, with no operator action.** That is 32 days out. The morning it fires, every one
of the 22 gates starts biting at once — including a set that currently contradicts what the pricing
page promises.

| # | Fix | Why it cannot wait |
|---|---|---|
| 0.1 | Seed `beta_grace` explicitly via migration | A date this consequential must be a decision on a row, not a fallback in a constant |
| 0.2 | Correct the 6 wrong `pricing_feature_gates` override rows | `space_automation`, `space_team`, `space_multi_pipeline` are stored at `business` but coded `collective`, so Collective's three headline differentiators would open at Business. `space_storefront` is **raised** to `business` from a code floor of `free`. `space_crm` and `space_whitelabel` carry retired labels (`practitioner`, `whitelabel`) |
| 0.3 | Fix `isPaidSpacePlan` (`lib/pricing/space-limits.ts`) | 🔴 It reads `p === 'business' \|\| p === 'nonprofit'`, omitting `collective` and `independent`. **All four paid Spaces in production are `collective`**, so every paying Space currently fails the multi-Space unlock. Masked only because the caller is wrapped in `featureGatesLive()` — which un-masks on 2026-09-01 |
| 0.4 | Make the Journey publish cap honour `gatesLive` | It is the one cap that bites **today**, and it reads `profiles.membership_tier` raw, so a free Member is blocked while `BETA_OPEN_ACCESS` tells the UI they are Crew |

⚠️ All four are migration files in `supabase/migrations/`. **Never `supabase db push`** — one shared DB.

### Phase 1 — Unblock the transaction 🔴 highest value, smallest diff

**Goal:** a free Member can take money today.

1. Delete the free-Member ticket block in `lib/events/ticket-eligibility.ts`; keep the module as the
   single seam and invert it to answer "is this seller payout-ready?"
2. Remove `event_paid_tickets` and `personal_payouts` from `FEATURE_GATES`; add a migration that
   deletes any `pricing_feature_gates` override rows for those keys so the DB layer cannot
   resurrect them.
3. **Connect onboarding at first sale**, not in settings. ⏳ **Partly done.** The price field now
   names the payout account as a two-minute setup step with a link, rather than as a dead end. What
   remains is the *conditional* version: showing it only when the payee is not already payout-ready.
   That needs readiness threaded through four render sites (`events/new`, `events/[slug]/edit`,
   `events/drafts/[id]`, `event-spark`), so it is tracked separately rather than half-built.
   Nothing is gated either way; the money simply cannot move until Stripe has them, which is a
   banking fact, not a tier.
4. Ladder copy in `feature-tiers.ts` for these keys is deleted (the ladders exist only for gates).

**Done when:** a `membership_tier = 'free'` profile with no Space can publish a priced event, a buyer
can complete checkout, and the fee recorded is 10% of a network sale and 0 of an own-audience sale.

### Phase 2 — The five-rung rate table

**Goal:** the rate is a function of tier, read from one place, editable by an operator.

1. `lib/billing/take-rate.ts` (new): `networkRateBps(sellerTier)` returning the five rungs, reading
   `pricing_settings.take_rate` with the code map as fail-safe default.
2. Every money path calls it: tickets, shop/services/bookings, space memberships. Tips do not
   (`fee = 0`, asserted by test).
3. Read-modify-write on the admin console so saving a rate cannot wipe a sibling key (the bug that
   silently reverted `network_bps` on every operator save).
4. A **receipt**: every settled order stores the rate applied and the audience signal that decided
   it, so "why did you charge me for that sale?" has an answer.

**Done when:** a table test asserts all five rungs × {own audience, network} = the ten expected
outcomes, and the admin console round-trips a rate change without touching neighbours.

### Phase 3 — Gates and meters reconciled ✅ shipped

**Goal:** no feature is both gated and metered; every gate is enforced at a real call site.

| # | Item | Status |
|---|---|---|
| 1 | `space_memberships` (business) + `space_campaigns` (business), both wired at a **write** chokepoint | ✅ |
| 2 | `space_membership_tickets` lowered collective → business | ✅ |
| 3 | `PLACEHOLDER_METER_LIMITS.space_crm` 250 → 200, and every restatement of it derived rather than typed | ✅ |
| 4 | `space_memberships` meter deleted (it collided with its own new gate) | ✅ |
| 5 | **Drift guard**, `lib/pricing/gate-meter-drift.test.ts` | ✅ |
| 6 | Convert `space_crm` / `space_email` from gates to meters | ✅ Phase 3b (ADR-917) |
| 7 | Delete or wire the remaining decorative gates | ⏳ 10 of 12 remain after Phase 3b |

**Why 6 and 7 did not ship with the rest.** Deleting the `space_crm` gate before contacts are
actually counted would replace an *enforced* limit with an *unenforced* one, and hand free Spaces
unlimited CRM. That is strictly worse than the contradiction it fixes. `withinAllowance()` — the
declared meter-enforcement seam — has **zero call sites in the entire repo**, and contacts are
written from more than twenty seams, so building the counting seam is its own piece of work.

**The drift guard is the deliverable that makes the rest safe.** It fails CI on any *new* gate/meter
collision and any *new* gate with no call site, while carrying the 9 existing collisions and 11
existing decorative gates as named exceptions with a reason each. Both lists are **ratchets**: a test
asserts that every exempted key is still genuinely in violation, so a fixed entry must be deleted and
a stale exemption cannot shelter the next one.

### Phase 3b — Make the meters real ✅ shipped (ADR-917)

**Goal:** a published allowance is a number the product actually enforces.

| # | Item | Status |
|---|---|---|
| 1 | Counted write seam for `contacts` (`lib/crm/contact-allowance.ts`), `space_crm` gate deleted | ✅ |
| 2 | `space_email` monthly sends enforced in the delivery core, beside the 500/day throttle | ✅ |
| 3 | `PLAN_CODE_CAPS` · `BASE_SEAT_ALLOWANCE` · `vera_free_daily_cap` collapsed onto their meters | ✅ |
| 4 | Decorative gates: `space_team` + `space_multi_pipeline` deleted | ⏳ 10 of 12 remain |
| 5 | The grandfather rule + the platform-root exemption (`lib/pricing/space-allowance.ts`) | ✅ |

**The chokepoint finding.** There is no single database chokepoint for contacts. `contacts` is written
from **four** modules — `captureLead` (the one engine behind all five lead-grab doors),
`linkMemberToSpaceLead`, the CSV importer, and the graduation bridge. The ~20 seams an audit counts are
*callers* of those four. One shared guard those four call is the architecture; twenty inline checks is
not. Two writers are deliberately unguarded and say so in their own comments: the ticket buyer's contact
row (written after the money moved) and `ensureSpaceMemberContact` (written after someone already
joined). A meter stops new writes; it does not desynchronize the database.

**What bites, and when.** Contacts, monthly sends, and seats ride `featureGatesLive()`, so nothing new
bites during the beta grace window. The QR cap is **always on**, because it already bit before this
phase and routing a live limit through a false flag would have switched it off.

**What is enforced against.** The effective cap is `max(published allowance, current count)`, so a cap
governs growth from today and is never retroactive. See Phase 8 for why, and for the correction to the
production finding that shaped it.

### Phase 4 — Upsell tooltips everywhere a meter exists

**Goal:** step 8 of the directive. Every meter has a surface, and every surface has a prompt.

1. Inventory: for each key in `PLACEHOLDER_METER_LIMITS`, find the UI that shows usage. A meter with
   no surface is invisible and cannot convert.
2. One component, `<MeterUpsell>`, built on the existing `upsell-tease` primitives, appearing at
   **80% of the allowance** (goal-gradient), naming what you have built (loss aversion), and naming
   the rate improvement, not just the cap lift.
3. Copy rule: every tooltip is one sentence about what YOU have, one about what changes. Never a
   sentence about what you are missing.
4. Placement audit across every `/manage` console, the event editor, the CRM, the campaign builder,
   and the Space settings.

**Done when:** a test enumerates `PLACEHOLDER_METER_LIMITS` and asserts each key appears in the
tooltip registry.

### Phase 5 — One feature grid, generated ✅ shipped (ADR-916)

**Goal:** two marketing pages can never again disagree about what a tier includes.

No `feature-matrix.ts` was built. `lib/pricing/pricing-grid.ts` was ALREADY that module, so the work
was pointing the other structures at it and deleting their copies, which is the whole shape of this
phase: **a tenth source would have made it worse.**

| # | Contradiction (A2) | Status |
|---|---|---|
| 1 | Business $29 vs $19 | ✅ `SPACE_PLAN_PRICE_CENTS` carries `{list, beta}` for every plan, read off the code catalog; `tierPriceCents` resolves through the beta window. `COLLECTIVE_BETA_CENTS` is now one cell of that map, not a patch. ⚠️ the in-app `plan-ladder.tsx` still renders list |
| 2 | Three take-rate sources | ✅ collapsed to one code vector (`NETWORK_TAKE_RATE_DEFAULT`), which `PRICING_DEFAULTS.take_rate` now READS. The operator overlay layers on top wherever a DB read is available |
| 3 | `pricingTiers()` rate literals | ✅ derived from `spaceOfferings`; both `/llms*.txt` routes resolve the operator's config, so an admin edit moves the corpus |
| 4 | Stale `$49` comparison anchor | ✅ `FREQUENCY_BUSINESS_MONTHLY` / `FREQUENCY_ALL_IN_MONTHLY` read the catalog through the beta window |
| 5 | Independent's display status | ✅ ruled: displayed on every PUBLIC surface, not an in-app upgrade path. Code and comment agree |
| 6 | Ladder copy vs meter numbers | ✅ the comment became a test: any quantity a ladder line names must be an allowance its meter grants |

1. `PRICING_DEFAULTS` moved to `lib/pricing/defaults.ts` (PURE), so the derived model can read the one
   shape without dragging the service-role client into a client bundle. Every field is read, not typed.
2. `lib/marketing/marketing-figures.test.ts` is the Gate 2 lock, in two halves: NEGATIVE (no marketing
   surface contains a literal dollar figure, or any percentage but the structural `0%` / `100%`) and
   POSITIVE (change one rate in the config and the grid, the tier table, and the published ladder all
   move together, so "no literals" cannot be satisfied by a second copy of the numbers).

**Not closed, deliberately.** `app/page.tsx` and `/what-is-frequency` interpolate at module scope and
`app/(marketing)/layout.tsx` reads no `cookies()`/`getUser()`, so both still resolve the CODE defaults
rather than the operator's rows. They are on the same SOURCE as everything else now, one layer below the
overlay; moving them is a page-shape change and belongs with Phase 6.

### Phase 6 — Rewrite the marketing pages

**Goal:** steps 5 and 9 of the directive.

Pass A (content), then Pass B (design), as two separate commits so the diff is reviewable.

1. **Audit first.** List every marketing route, mark each: KEEP / CONDENSE / MERGE / DELETE. Around
   30 routes exist; several are SEO long-tail pages that should keep their URL and get a new body.
2. **Rewrite** against `docs/CONTENT-VOICE.md` §10: camp counselor you actually respect, proper nouns
   carry the magic, plain sentences, no em dashes, skeptic test on every claim.
3. The pricing page leads with the **rate promise**, not the tier grid. "Your own people are always
   free" is the headline; the grid is the proof underneath it.
4. Pass B: compose the page templates properly (`docs/PAGE-FRAMEWORK.md`), semantic tokens only, no
   hardcoded hex, per-section `<Suspense>`.

**Done when:** every marketing page's tier claims match the generated matrix, and the voice checklist
passes on each.

### Phase 7 — Remove the rot

**Goal:** steps 3 and 4 of the directive.

1. Docs: fold `PRICING-LADDER-PLAN.md` §1–§1b and `PRICING-OPTIONS-STRATEGY.md` into this document;
   leave each file with a pointer, not a duplicate. `PRICING.md` keeps only mechanics.
2. Code: delete superseded tier constants, retired plan labels, unused ladder copy.
3. Database: audit `pricing_feature_gates`, `pricing_settings`, and `pricing_catalog` rows against
   the new canon. Every removal is a migration file in `supabase/migrations/`. **Never
   `supabase db push`** — one shared DB.
4. ADR for each decision that changed, appended to `docs/DECISIONS.md`. Never rewrite a historical ADR.

### Phase 8 — Grandfathering and migration safety

**Goal:** nobody's live product changes under them.

#### Live verification, re-run 2026-07-30 against production

| Check | Count | Verdict |
|---|---|---|
| Settled tickets, all time | 0 | ✅ no fee history to honour |
| Succeeded tips | 0 | ✅ |
| Membership tiers on free Spaces (any price) | 0 | ✅ the new `space_memberships` wall strands nobody |
| Stripe accounts with onboarding complete | 0 | ✅ and 🔴 — see Phase 1 |
| **Free Spaces over the new 200-contact cap** | **0** | ✅ see the correction below |

#### 🔴 A correction to this table, and the bug it exposed

An earlier pass of this section reported **"1 free Space holding 567 contacts"** as a real grandfather
case, and drove a plan change off it. **That was wrong.** The 567-contact Space is `frequency`, the
platform's own **root hub** (`type = 'root'`, `plan = null`), not a customer. The largest genuine
customer list is 518 contacts on a **paid Collective** Space, which is unlimited. Re-verified
2026-07-30: **zero** customer free Spaces exceed the allowance.

The cause is worth more than the correction. The query said `coalesce(plan, 'free')`, which turns the
root hub's `null` plan into "free" — the exact same defect the product has: `asSpacePlan(null)`
narrows to `'free'`, which is correct default-deny for a tenant and precisely wrong for Frequency's
own records. So the audit reproduced the bug it was auditing for, and then reported the platform's own
list as a customer at risk.

⚠️ **This was already biting in production, not hypothetically.** The root hub holds 36 QR codes
against a free cap of 3, and the live cap refuses it a 37th today. Enforcement therefore exempts
`type = 'root'` before any allowance is read.

**The grandfather rule stays regardless**, and the reasoning is unchanged: a cap must never block an
owner below their current count. It is now insurance rather than a fix for a known case, which is the
right posture for a rule about not breaking people.

#### The rest

1. Every new gate ships behind `featureGatesLive`, which is false. Nothing bites until the grace
   window closes, which is why Phase 0 made that date visible and editable.
2. Any Space already using a now-gated feature gets an explicit grandfather entitlement row rather
   than a silent break.
3. ⏳ The Phase 0 migrations are written but **not yet applied** — `beta_grace` is still absent and
   all 11 gate override rows are still live in production. They apply on merge. Until then the fuse
   described in Phase 0 is still lit.
4. Re-run the table above immediately before enforcement goes live. It moved once already.

### Phase 9 — The verification protocol

Step 10 of the directive. It has its own section below because it applies to every phase.

---

## 6. The verification protocol

Every phase passes all six gates before it is called done. This is the "double check your work"
protocol, and it is deliberately mechanical — the failure mode being defended against is a confident
report that was never actually measured.

### Gate 1 — Machine checks

```
pnpm lint && pnpm test && pnpm build && pnpm check:menu
```

No phase ships on a red or a skipped suite. A skipped test is a failure.

### Gate 2 — The single-source assertion

For every number in the product (a rate, a cap, a price), there is exactly ONE definition and every
other appearance reads it. Enforced by test, not by discipline:

- no hardcoded percentage in a marketing page
- no hardcoded price outside `feature-tiers.ts`
- no meter limit outside `feature-meters.ts`
- no gate outside `gates.ts`

### Gate 3 — The contradiction sweep

Run after every phase:

| Check | Fails when |
|---|---|
| Gate ⊕ meter | A key is in both `FEATURE_GATES` and `PLACEHOLDER_METER_LIMITS` |
| Gate → call site | A gate has zero enforcement call sites and is not marked display-only |
| Matrix → gate | The marketing matrix claims a floor that differs from the gate |
| Doc → code | A doc names a rate or cap that the code does not |

### Gate 4 — Fail-direction review

For every money-touching change, state in the PR which direction it fails in. The rule is absolute:
**under-charging on an error is recoverable; charging a fee we promised not to is not.** Any new
branch that can result in a charge must default to not charging when it cannot prove the answer.

### Gate 5 — Adversarial pass

Before a phase is called done, one pass whose only job is to break it, asking:

1. Which of the ten rate outcomes did I NOT test?
2. Which write seam sets this value that I did not gate? (Price can be set at four seams; a gate on
   three of them is not a gate.)
3. What does an existing user see the morning after this ships?
4. Did I verify this, or did I verify something adjacent that was easier to check?

🔴 Question 4 is the one that has actually bitten. A fix was previously reported as verified against a
rendering that was not the real case. **Measure the real case, or say it is unverified.**

### Gate 6 — Report honestly

The completion report states what was measured, what was inferred, and what was skipped. "Inferred,
not proven" is an acceptable outcome. A confident claim about something unmeasured is not.

---

## 7. Open items

| # | Item | Status |
|---|---|---|
| 1 | Stripe Connect onboarding UX for free sellers | ⏳ Phase 1. Decision: trigger at first sale, never in settings |
| 2 | Grandfather entitlement rows | ⏳ Phase 8. No affected rows exist today; re-verify at ship |
| 3 | 31 disclosed claim tokens | ⏳ Owner ruling: leave as is, close out later (`docs/BACKLOG.md` §A) |
| 4 | Annual billing discount | ⏳ Not in this pass |
| 5 | `app/(marketing)/layout.tsx` awaits three `getMenu` reads before returning JSX | ⏳ Harmless on the 37 static marketing pages, which prerender. On the three genuinely dynamic routes (`/rsvp/[token]`, `/beta/confirm`, `/subscribe/confirm`) it runs per request and blocks the shell **ahead of** the Suspense boundaries added around their own data. Fixing it means pushing the menu promise into `MarketingHeader` behind its own boundary, which is a header refactor rather than a cheap change |
| 6 | Value-comparison mobile parity | ✅ closed as a side effect of unifying the two grid renderers. The desktop table showed "what you get on Frequency" and the **mobile stack never rendered it at all**, so phone visitors saw a feature name, a competitor and a price, with our side of the comparison missing entirely |
| 8 | 🔴 **The membership wall has a hole at the buy seam, and closing it conflicts with a live guard** | ⏳ **Needs an owner call.** `space_memberships` is enforced where tiers are AUTHORED, not where they are SOLD. A free Space that created tiers during the beta keeps selling them the day the gates bite, which is exactly the population a newly-live gate should stop. The obvious fix (a gate check in `space-membership-checkout.ts`) is refused by `gates-live.test.ts`, which forbids any charging seam from reading `featureGatesLive` (ADR-874: "may we charge" and "do gates bite" are different decisions). That guard is right about the beta window and does not anticipate a plan-gated product. I did **not** weaken it and did **not** route around it with an indirection, since a helper call would pass the grep while defeating the intent. Live exposure is **zero** (no free Space holds a tier). Three ways out: relax the guard with a documented third category; deactivate a free Space's tiers when gates go live (a data answer, not a charging-path one); or accept the hole |
| 7 | Six Puck-backed pages carry two renderings each | ⏳ Owner call. Now less urgent: Appendix C settles which default wins on each route, so the second rendering is a documented fallback rather than an ambiguity |

---

## Appendix C — how the CMS and the pricing model fit together

Settled 2026-07-30 (ADR-918), because "an operator can edit it" and "the numbers stay live" pull in
opposite directions and the resolution has to be written down.

### The rule

**A janitor edits the WORDS. The NUMBERS stay derived.**

A `Tiers` card binds to an offering via `livePriceKey`; its price, struck anchor and rate resolve at
render from the same config the checkout bills on. The typed `price` / `strikePrice` fields remain, and
are the right choice for genuinely editorial cards (an add-on, "Space Memberships: Owner-set") that
have no offering behind them. They also serve as the fallback if a key stops resolving.

🔴 Without this, the first Publish of a pricing page would freeze every figure into a jsonb document,
and an `/admin/pricing` edit would move the generated page while the published one quoted stale
numbers. That is the nine-disagreeing-sources problem this document exists to fix, reintroduced
somewhere strictly worse: a database row is not greppable, and no test can read it.

### Why `/pricing` has two fallback rungs and the others have three

| Route | Chain | Why |
|---|---|---|
| `/pricing` | published → **coded page** | Its coded page is the DERIVED one: live prices, live rates, the real gate map, no figure typed anywhere. The template is a static document, so inserting it as a middle rung would mean any deploy where nobody has published silently downgrades the page from live figures to a snapshot |
| the other seven | published → template → legacy | Their coded page is a last-resort relic and the template is the designed version, so the template genuinely is the better default |

Both chains say the same thing — **published words beat the best available default** — they just
disagree about which default is best, for a reason specific to each page. That is a decision, not an
inconsistency.

### Where the member-facing half lives

`/upgrade` is the member's half of `/pricing` and sits in `app/(main)` behind auth. It reads the same
config and uses the same phrasing, and it **leads with the rate**, because selling is free on every
tier and the rate drop is the most concrete thing a member buys. It listed a badge and some Gems until
ADR-918, which meant the marketing page and the actual upgrade screen were selling different products.

---

## Appendix A — the surface inventory (measured 2026-07-30)

### A1. Nine structures enumerate what a tier gets. They do not share one source.

| # | Structure | Path | Driven by |
|---|---|---|---|
| 1 | The Pricing Grid (7 offerings, 2 grids) | `lib/pricing/pricing-grid.ts` | ✅ fully derived from gates + meters + operator DB |
| 2 | `pricingTiers()` (5 columns) | `lib/pricing/pricing-page.ts` | ✅ Phase 5: derived from `spaceOfferings`; the rate strings are gone |
| 3 | `FEATURE_TIER_LADDERS` (21 ladders) | `lib/pricing/feature-tiers.ts` | ✅ Phase 5: prices read from the catalog, beta-aware |
| 4 | `FEATURE_METERS` (22 ladders) | `lib/pricing/feature-meters.ts` | ⚠️ hardcoded quantities |
| 5 | `FEATURE_GATES` | `lib/pricing/gates.ts` | ✅ the only structure enforcement reads |
| 6 | `PlanLadder` in-app rungs | `…/settings/billing/plan-ladder.tsx` | ⚠️ prices now derived, but it renders the LIST price, so Business reads $29 against /pricing's $19. One line to fix (`spacePlanPriceCents`) |
| 7 | Value comparison anchors | `lib/pricing/comparison.ts` | ✅ Phase 5: read from the catalog through the beta window |
| 8 | Puck pricing template | `lib/page-editor/templates/pricing.ts` | ⚠️ reachable from `/pages` (ADR-915), inert output; its `$90` literals are gone |
| 9 | Funnel plan rows (5 niches) | `lib/marketing/funnel-config.ts` | ✅ Phase 5: on the one rate vector, no literals |

### A2. Six confirmed contradictions between them

| # | Contradiction | Evidence |
|---|---|---|
| 1 | **Business price: $29 vs $19** | `/pricing` quotes $19 beta under a $29 anchor (`PRICING_DEFAULTS.plan.business`); every `FeatureTierRange` rung and `PlanLadder` quote a flat $29 (`PLACEHOLDER_SPACE_PRICE_CENTS.business`). Collective got a `COLLECTIVE_BETA_CENTS` patch; Business never did |
| 2 | **Three take-rate sources** | `/pricing` reads the operator DB; `app/page.tsx` + `/what-is-frequency` + `/llms.txt` read `PRICING_DEFAULTS.take_rate`; the funnels read `NETWORK_TAKE_RATE_DEFAULT`. An operator edit moves exactly one of the three |
| 3 | **`pricingTiers()` rates are literals** | They drive `/llms.txt` and `/llms-full.txt`, so an operator edit desyncs the answer-engine corpus from the page |
| 4 | **Value-comparison anchor is stale** | `FREQUENCY_BUSINESS_MONTHLY = 49` is neither the beta ($19) nor the list ($29). It renders live on `/pricing` |
| 5 | **Independent's display status** | `pricing-page.ts` comments "not displayed" and then returns it; the in-app ladder genuinely hides it. So `/llms*.txt` publishes a tier the app does not |
| 6 | **Ladder copy vs meter numbers** | Kept in sync by a comment ("keep these lines in step"), not by a test |

✅ All six are closed by Phase 5 (ADR-916), with two residues named in the phase table above: the in-app
`PlanLadder` still renders the list price, and the two static marketing pages still read the code
defaults rather than the operator's rows. The fix shape was the same each time: `pricing-grid.ts` was
already correct and already derived, so the work was pointing the other eight at it and deleting them.

### A3. Meters with no in-context upsell (Phase 4 worklist)

**All six tier-axis meters are total gaps.** The Space billing hub filters to `axis === 'plan'`, and
`/upgrade` mounts no meter component at all.

| Axis | Meter | Gap |
|---|---|---|
| tier | `vera_unlimited` | on/off tease only, silent while gates are off. No allowance readout |
| tier | `journey_publish` · `journey_enrollees` · `practice_publish` | prose in `AuthoringAccessNote`, no meter |
| tier | `circle_host` | on-click lightbox only. No "1 of 1 Circles hosted" |
| tier | `event_create` | 🔴 full gap. The gate was removed and nothing replaced it |
| plan | `space_qr` · `space_bookings` · `space_tickets` · `space_membership_tiers` | the settings section mounts `FeatureLockedNotice` **without** a `featureKey` |
| plan | `space_membership_tiers` · `space_journey` · `space_journey_publish` | no surface at all |
| plan | `space_multi_pipeline` · `space_collaborators` · `space_vera` · `space_crm_playbooks` | no meter mount |
| plan | `space_team` | `SeatCounter` on the billing page only, nothing at `/settings/members` where seats are added |
| — | free-Space creation cap | enforced in `lib/spaces/provision.ts`, zero UI |

Covered today: `space_crm`, `space_email`, `space_automation`, and (bespoke, not meter-driven)
`space_crm_resonance_ai`.

🔴 **Two errors in the table above, found only by trying to act on it.** They are left visible rather
than silently corrected, because both are the same mistake — reading a mount as a working surface.

1. **Passing the missing `featureKey` fixes nothing on its own.** Those four `FeatureLockedNotice`
   mounts only ever render `reason: 'role' | 'disabled'`, never `'plan'`, so they are the *locked*
   state of a surface a free Space never reaches. A member at 80% of an allowance is by definition
   using the feature successfully, so they never see that component. The prompt has to go on the
   **working** surface, which is where Phase 4 put it.
2. **`SeatCounter` is already on `/settings/members`.** What was missing was the upsell beside it,
   not the counter.

### A4. Deletion candidates (Phase 7)

⚠️ **This list was written from a discovery pass and TWO of its top three entries were wrong.** The
verdicts below are the post-verification ones (ADR-915). The durable lesson: *a duplicate is only dead
if nothing can reach it, and "nothing" includes the operator.*

| Candidate | Verdict |
|---|---|
| `lib/marketing/personas.ts` + test | ✅ **DELETED.** Zero *production* importers confirmed (one test importer, repointed). Note the repo has FOUR persona registries; only this one was dead |
| `lib/page-editor/templates/pricing.ts` (374 lines) | 🔴 **NOT DELETED — operator-reachable.** `pricing` is a row in `EDITABLE_PAGES`, so a janitor can open it at `/edit/pricing` today. The sweep found something worse than a dead file: that control is **inert**. A janitor can edit and Publish and a visitor sees nothing, because `/pricing` is 665 hand-coded lines that never read the published doc, unlike the six primaries. Needs a decision (wire it in, or drop it from `EDITABLE_PAGES`), not a deletion |
| `app/(marketing)/beta/[slug]` | 🔴 **NOT DELETED — live.** `BETA_SEQUENCES` is not empty; it carries `breathwork` (ADR-619) and `/beta/breathwork` prerenders and serves. The sweep proposed deleting it because **the route's own header comment said the registry was empty** — a comment left stale when the funnel was added. A wrong comment nearly deleted a working route |
| 15 × redirect stubs → `next.config.ts` | ⚠️ **RECOMMEND AGAINST.** Both emit **308**, so there is zero SEO gain, which was the entire case. Against: a config `source` that matches a real page silently shadows it with no build error, and this repo has already been burned exactly that way (`funnel-redirects.test.ts` exists because three `/for/*` rules 404'd live pages the sitemap was submitting). It would also blind `check:seo`, which carries all 15 with verified per-route reasons |
| `FREQUENCY_BUSINESS_MONTHLY` / `FREQUENCY_ALL_IN_MONTHLY` | Stale literals rendering live |
| `pricingTiers()` hardcoded rate + `coreIncluded` strings | Superseded by the derived grid. Point `/llms*.txt` at the grid and delete |
| `PricingTier.preview` | Worse than unused: it is **read** in `pricingLadderSummary` and assigned by nothing, so it is a live branch that can never be taken |
| `UPGRADE_COPY['create-event']` | Dead copy. Event creation was ungated |
| `app/(marketing)/beta/[slug]` | `BETA_SEQUENCES` is empty; every slug 404s |
| 15 × 8-line redirect stubs | Correct as SEO stubs, but belong in `next.config.ts` as one table |
| `components/teaser-gate.tsx` (1 mount site) | A third gating idiom beside `CrewGate` and `UpsellTease` |
| `upgrade-crew` · `crew-preview-banner` · `space-crm-prompt` · `compete-locked` | Four bespoke nudges, four localStorage keys, four hand-written copies, none reading the feature config |
| `app/page.tsx` hardcoded `$0` | ⚠️ **Leave as copy.** It is a proof-band claim ("To show up") beside `500+ mornings`, not a tier price. There is no catalog entry to derive it from, so binding it to a price source would be a category error |

### A5. Marketing page verdicts (Phase 6 worklist)

| Verdict | Routes |
|---|---|
| **REWRITE (states tiers/prices/rates)** | `/pricing` · `/` · `/what-is-frequency` · `/for/[niche]` × 5 · `/llms.txt` · `/llms-full.txt` · `/upgrade` · `/about` (rate prose) · `/the-community` (Crew price) |
| **REDESIGN ONLY (no commercial claims)** | `/spaces` · `/the-quest` · `/the-lab` · `/vs` + `/vs/[slug]` × 5 · the 7 SEO pillars · `/start` · `/beta` · `/subscribe` |
| **DECIDE ONE RENDERING** | The 6 Puck-backed pages each carry a CMS doc **and** a several-hundred-line coded fallback |
| **COMPOSE THE KIT** | `/beta/confirm` · `/subscribe/confirm` hand-roll bare divs |
| **RECONCILE** | `/upgrade` is the member pricing surface and shares no vocabulary with `/pricing`. `/for/[niche]` is a parallel design system to `marketing-ui` |

⚠️ Constraint for the rebuild: `app/(marketing)/layout.tsx` deliberately reads no `cookies()` or
`getUser()` so children stay static/ISR. Nothing added in Phase 6 may break that.

---

## Appendix B — the enforcement audit (measured 2026-07-30 against `1b5e878`)

**The one-line finding: the gate system is not the tier system.** It is a second, quieter opinion
about the tier system, and the two disagree in ten places.

### B1. Gate catalogue: 22 rows, 6 enforced, 2 partial, 14 decorative

| Status | Gates |
|---|---|
| ✅ **enforced** (a call site can refuse) | `space_membership_tickets` · `space_collaborators` · `space_crm` · `vault_cash_in` · `vera_unlimited` |
| ⚠️ **partial** | `space_email` (page render only; the send seams call the pure default-ON resolver) · `gamification_full` (UI affordance, no server refusal) |
| 🔴 **mapped but unreachable** | `space_storefront` (`spaceFunctionAccessLive` is never called for `shop`) |
| 🔴 **decorative, zero call sites** | `personal_payouts` · `event_paid_tickets` · `space_automation` · `space_crm_playbooks` · `space_crm_resonance` · `space_crm_resonance_ai` · `space_team` · `space_multi_pipeline` · `space_whitelabel` · `space_revenue_splits` · `space_sms` · `journey_library_list` · `entry_points` |
| ✅ **intentionally decorative** | `space_full_website` (enforced by a pure default-deny entitlement key so it survives the short-circuit) |

### B2. Meter catalogue: the declared enforcement seam is dead

🔴 **`withinAllowance()` has zero call sites in the entire repo.** It is documented as "THE one place
real enforcement will flip on". Nothing in the product counts and refuses through it.

| Status | Meters |
|---|---|
| ✅ genuinely enforced | `journey_publish` · `space_journey_publish` (both bite today, both ignore `gatesLive`) |
| ⚠️ shadowed by a duplicate hardcoded cap | `space_qr` (`PLAN_CODE_CAPS`) · `space_team` (`BASE_SEAT_ALLOWANCE`) · `space_email` (a 500/day cap, not the published monthly one) · `space_vera` · `journey_enrollees` |
| 🔴 display only | the remaining 15 |

✅ **Closed by Phase 3b (ADR-917).** The write question got its own seam, `allowanceVerdict` (
`withinAllowance` stays, answering the display question it always answered, and the two differ at the
boundary on purpose). Genuinely enforced now: `space_crm` at four contact-write seams, `space_email`
per calendar month in the delivery core, `space_qr` at create (always on), `space_team` through the
seat wall. All three duplicate ladders read their meter instead of a local number. Still display only:
`space_multi_pipeline`, `space_bookings`, `space_tickets`, `space_journey`, `space_membership_tiers`,
`space_collaborators`, `space_automation`, `space_crm_playbooks`, `space_crm_resonance_ai`, and the six
tier-axis meters other than `journey_publish` / `journey_enrollees`.

### B3. The ten contradictions, by blast radius

| # | Conflict | Who wins |
|---|---|---|
| 1 🔴 | `space_crm` gate says `business`; its meter promises free Spaces 250 contacts. Same shape for `space_email`, `space_team`, `space_multi_pipeline`, `space_crm_resonance_ai` | Today the meter, vacuously (free Spaces get **unlimited** CRM). At `gatesLive` the gate, and free Spaces lose the CRM the page promised |
| 2 🔴 | `space_storefront` coded `free`, stored `business` | Neither. The gate is never called, so the storefront is ungated for everyone. Flipping gates live would not close it |
| 3 🔴 | Three DB rows lower `collective` gates to `business` | The DB. Collective's three headline differentiators open at Business |
| 4 🔴 | Journey caps bite today and ignore both `gatesLive` and `BETA_OPEN_ACCESS` | The cap. Free Members are blocked while the UI says they are Crew |
| 5 🔴 | `gamification_full` gate vs `platform_flags.gamification_full_member = true` | The flag, permanently, even after gates go live |
| 6 🔴 | `event_paid_tickets` gate vs `ticketSellerVerdict` | The predicate. Two ladders for one rule. **Phase 1 deletes both** |
| 7 ⚠️ | `space_qr` meter vs `PLAN_CODE_CAPS` (which still carries retired `starter`/`pro` labels) | The hardcoded map |
| 8 ⚠️ | `space_email` published monthly cap vs the only live cap (500/day, all plans) | The daily cap. A free Space's real ceiling is ~15,000/mo, **50× the published free allowance** |
| 9 ⚠️ | Doc comments in `lib/spaces/function-access.ts` assert an entitlement read that no longer exists | Reality: CRM/email/shop are ON for every Space today |
| 10 ⚠️ | `space_full_website` is in `BUSINESS_DEPTH_ENTITLEMENT_KEYS` but its gate is `enabled:false` | The entitlement key. Correct by design |

### B4. Ad-hoc re-derivations of "is this paid"

The canonical predicates are `isPaid(deriveTier(tier))` and `asSpacePlan(plan)`. These bypass them:

| Where | Re-derives | Risk |
|---|---|---|
| `lib/pricing/space-limits.ts` | `isPaidSpacePlan` = business \|\| nonprofit | 🔴 **Bug.** Omits `collective` + `independent`; all 4 paid Spaces are `collective` |
| `app/(main)/messages/page.tsx` (×2) | ~~`PAID_TIERS = ['crew','supporter']`~~ | ✅ Fixed 2026-08-24 (ADR-1106): the list is `['crew']` and the server action routes through `isPaid`. The retired rung is gone from the union, so the raw column can only read `free` or `crew`. |
| `app/(main)/events/index-data.ts` | same inline array | 🔴 |
| `lib/journeys/journey-access.ts` · `publish-gate.ts` | `paidSpace = plan !== 'free'` | ⚠️ A second, disagreeing definition of "paid Space" |
| `lib/qr/space-codes.ts` | its own plan → number map | ⚠️ A third plan ladder |
| `app/(main)/admin/pricing/load.ts` | inline re-implementation of `featureGatesLive()` | ⚠️ Drifts if the helper changes |

### B5. Live production state

| Table | Finding |
|---|---|
| `profiles.membership_tier` (48) | crew **33** · free 15 · supporter **0** (the `deriveTier` supporter mapping was dead weight; ✅ removed 2026-08-24, ADR-1106, and the column CHECKs to `free`/`crew`) |
| `spaces.plan` (19) | free **14** · collective **4** · null 1 (root). 🔴 **No Space is `business`, `nonprofit`, or `independent`** |
| `pricing_settings` (13 rows) | 🔴 `beta_grace` **absent**. `take_rate` holds only the legacy flat blob (`free_bps`, `member_bps`, `business_bps`, `nonprofit_bps`) with **no `network_bps`** — the live vector comes entirely from the code default via per-field merge |
| `pricing_feature_gates` (11 rows) | 6 of 11 disagree with the code map (see B3) |
| Stripe Connect | 🔴 **1 profile has an account; `charges_enabled`, `payouts_enabled`, `details_submitted` are all 0.** Nobody on the platform can receive money today |

🔴 **B5's last row is the single most important operational fact in this audit.** Every rate, gate,
and ladder below is theory until one Express account completes onboarding. It is also the strongest
possible argument for the Phase 1 decision to trigger onboarding **at first sale**: the funnel is
open, it is guarded correctly, and it has zero completions because nothing ever asks.

### B6. Payout eligibility is role-based, not tier-based

`canReceivePayouts(id, role)` = `atLeastRole(role, 'host')` OR any non-suspended persona. It never
reads `membership_tier`, and the `personal_payouts` gate that claims to govern it has zero call
sites. Flipping the gates live changes nothing here — which means Phase 1's deletion of that gate
removes a claim that was never true rather than opening a door.

---

## References

- `docs/PRICING.md` — mechanics: three-flag model, gate table, Stripe wiring
- `docs/CONTENT-VOICE.md` §10 — the copy checklist every marketing rewrite runs
- `docs/NAMING.md` — tier names are locked; this document never coins a new one
- `docs/DECISIONS.md` — ADR-911 (host/venue split), ADR-913 (relationship attribution, 0% on tips)
- `lib/commerce/seller-audience.ts` — the six relationship signals
- `lib/pricing/gates.ts` · `lib/pricing/feature-meters.ts` · `lib/pricing/feature-tiers.ts`
