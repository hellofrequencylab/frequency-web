# How the money works (operator guide)

Plain-language operator reference for pricing, payments, and the switches that control them. Technical
source of truth stays in the code + `docs/DECISIONS.md`; this is the "how do I run it" companion.

There are two separate money flows. Keep them straight.

## 1. Plan billing (money in)

Members and Spaces pay Frequency for a plan. The current catalog (the Community Collective
ladder, ADR-811; every yearly price is two months free):

| Plan | Who buys it | Price |
|---|---|---|
| **Business** | a Space | $29/mo list, $19/mo founding beta charged today |
| **Collective** | a Space | $79/mo list, $49/mo founding beta charged today |
| **Non Profit** | a verified 501(c)(3) Space | $39/mo flat, never per seat |
| **Independent** | a Space going white-label, off the network | $249/mo flat, no founding discount |
| **Crew** | a member | **Pay what you want**, from $4.99/mo (floor), $24.99 suggested |
| **Supporter** | not a tier | A badge earned by paying at or above the suggested Crew amount |

The founding beta anchors ($19 Business, $49 Collective) auto-revert to list on 2026-09-01
(`lib/pricing/beta.ts`); a Space that bought at the founding rate keeps it. The Collective beta
price is the one `COLLECTIVE_BETA_CENTS` constant (`lib/pricing/feature-tiers.ts`), shared by
every surface that shows it. **Vera AI** is the sole add-on: +$20/mo on any paid Space plan.

All of this bills through Stripe subscriptions and one-time payments.

### Plan capabilities to know when members ask

| Capability | Plan floor | The rule |
|---|---|---|
| Collaborator hosting | Collective (Non Profit clears it) | Hosting an event or a venue WITH Collaborator Spaces needs the HOST Space on Collective (feature gate `space_collaborators`, ADR-835). Being a Collaborator on someone else's event stays free on every plan. A member-hosted event has no host Space, so it can never take on Collaborators; a person helping run an event is a Cohost. During the beta the gate is soft (nothing blocks until the paid-gates date, `beta_grace`); the Collective badge previews the post-launch model. |

## 2. Payouts (money through)

When a member tips a host, buys an event ticket, or buys from a Space storefront, the money goes to that
host or Space through **Stripe Connect**. Three rules come first (ADR-913):

1. **Tips carry no platform fee. Zero, on every tier.** A tip is a gift between two people; we are not
   in it.
2. **A sale to the seller's own audience costs them nothing.** Always 0%.
3. **A free Member cannot sell.** They can create events and take RSVPs, but selling tickets or taking
   payments needs **Crew** (the paid personal tier) or a **Business / Non Profit** Space.

Every order that is not a tip is classified as `self` (the seller's own audience) or `network` (the
network sourced it: referral, discovery, the marketplace). **Own-audience is a relationship, not a
cookie**: the buyer follows the Space, is an active Space member, is in its Space Contacts, is in the
seller's own contact list, or has bought from them before. Any one of those makes the order `self` and
the fee 0%. Network orders pay the ladder for the seller's tier:

| Seller | Network-sourced take-rate | Own audience |
|---|---|---|
| Member (free) | cannot sell (RSVPs only) | cannot sell |
| Crew | 8% | 0% |
| Business | 5% | 0% |
| Collective | 5% | 0% |
| Non Profit | 0% | 0% |
| Independent | 0% (off the network, so no network sales) | 0% |
| Tips, any tier | **0%** | **0%** |

Upgrading buys the fee down: Crew 8% to Business 5% to Non Profit 0%. The rates are set in the pricing
console (`/admin/pricing`, Take-rate); the seeded defaults live in `lib/pricing/settings.ts`.

The one line to give a member who asks: **Frequency charges once for the introduction. After that
they're your people, free.**

## Turning payments on and off

Everything ships **off**. Each switch is at `/admin/pricing` unless noted. Every flip is audited (who,
when, old to new) in `platform_flag_events`.

- **`billing_live` (the master switch).** The one switch that turns billing on. While it is off, nobody is
  charged and everyone keeps full access. It only takes effect when the **Stripe keys are also set** in
  the environment. It answers ONE question: **may we charge.** It does not decide whether paid features
  lock (see the next line, ADR-874).
- **The paid-gates date (`beta_grace`, at `/admin/pricing` under Beta controls).** The day the paid feature
  gates start blocking, set to **2026-09-01**. Until it arrives, billing can be fully live and every plan
  can sell while every member and Space keeps their paid features. On that date at 00:00 UTC the ladder
  starts biting, with no further operator action. The date itself is the first enforced day, so the last
  free day is Aug 31. Clearing the field means "no grace window": paid features would lock the moment
  billing goes live. **This is the only date on this page that changes access.**
- **`plan_business_enabled` / `plan_collective_enabled` / `plan_nonprofit_enabled` /
  `plan_independent_enabled`.** Show and sell each Space plan. A plan sells only when its switch **and**
  the master switch are both on.
- **`tier_crew_enabled` / `tier_supporter_enabled`.** The same for member plans.
- **`host_payouts_enabled`** (at `/admin/payments`). Turns the tips, ticket, and storefront payout
  marketplace on. Off means none of those payment controls appear anywhere.
- **The feature gates** (`/admin/pricing`, Feature gates). Each paid feature names the plan it needs. A gate
  that is turned **off** never blocks. Use this to permanently ungate one feature. For "free during beta"
  use the paid-gates date above instead: it covers every gate at once and turns them all on by itself on
  the day you set, so nothing depends on remembering a dozen toggles.

## The beta "free until Sept 1" setup (current state)

Where things stand today, in one paragraph: **nobody is charged.** The master switch
(`billing_live`) is **off**, and the code-side preview switch `PLACEHOLDER_PRICING`
(`lib/pricing/feature-tiers.ts`) is **on**, which marks every pricing surface as a preview.
Plan ladders, allowance meters, and upgrade buttons all render with real catalog numbers, but
every CTA only navigates; nothing checks out. Going live is a deliberate two-part flip: set the
Stripe keys and turn `billing_live` on at `/admin/pricing`, and have an engineer flip
`PLACEHOLDER_PRICING` to false.

On top of that, three beta pieces are currently set:

- **The paid-gates date (`beta_grace`) is `2026-09-01`.** This is what makes "explore every level, pay on
  Sept 1" work. You can turn `billing_live` on **today** and start selling plans: nobody loses a feature,
  because the gates do not begin until that date. No action is needed on Sept 1; the gates turn themselves
  on at 00:00 UTC.
- **The countdown clock (`beta_ends_at`)** is set to `2026-09-01`. It drives the "Summer of Frequency ends
  Sept 1" banner only; it changes nothing about access on its own. The founding beta prices ($19 Business,
  $49 Collective) auto-revert to list on the same date in code.
- **`gamification_full_member`** is on, comping free members the full gamification loop. Turn it back off
  when you want the Crew minimum to apply.

The pricing console states both switches in one line at the top: whether billing is live, whether the paid
gates are enforced, and the grace date. If you ever need the old all-or-nothing behavior, clear the
paid-gates date and the gates will follow the master billing switch exactly.

## Setting prices and syncing to Stripe

1. Edit the price in `/admin/pricing`. The Catalog section holds the live prices (Business, Collective,
   Independent, Non Profit, the Vera AI add-on, and the operator seat). Each shows a list anchor and the
   lower founding price that is actually charged. The yearly is two months free unless you override it.
2. Save. Nothing is charged by saving; you are only editing config.
3. Press **Sync the catalog to Stripe**. This creates or updates the Stripe products and prices. It is
   safe to run while billing is off, and it is idempotent, so running it twice does nothing extra. Stripe
   prices are immutable, so a price change creates a new Stripe price and archives the old one.

## How Founding Members and the Business plan are sold

- **The `/founders` page is retired.** It now sends visitors straight to `/pricing` (a permanent 301
  redirect, along with `/founders/offer` and `/founders/business`). The founders marketing funnel is
  gone; founding pricing lives in the plan catalog itself as the founding beta rates above.
- **Founding Members (personal).** A paid Founding Member is flagged for life and grandfathered at their
  rate. The founding rate and seat cap are edited in the `Founding rates` section of `/admin/pricing`.
- **Founding Businesses.** A Space that buys a plan at today's founding beta rate ($19 Business, $49
  Collective) is grandfathered at that price for the life of its subscription. The locked Founding
  Business display values are also edited under `Founding rates`.
- **Business plan (ongoing).** A Space owner buys it from their Space billing settings once the plan is
  enabled and billing is live. It includes a trial with a card upfront. Business is the full-depth tier;
  free is a usage state within Business, not a separate plan.
- **Managing a paid plan.** A paying Space shows a "Manage subscription" button in its billing settings
  that opens the Stripe billing portal, where the owner updates the payment method, changes or cancels the
  plan, and adjusts seats where the portal allows. It is Stripe hosted, so cancellation and payment updates
  always work, even if the master switch is later turned off.
- **Operator seats.** Once the operator seat is activated and priced, a paying Space also gets a direct
  seat editor on the same billing settings: the owner sets the licensed operator-seat count and the change
  is applied to the live subscription with proration (independent of whether the Stripe portal exposes
  seats). The owner's own seat is free; the count is the team beyond them.

## Founding rates and beta controls (on the console)

All of these now have an editor at `/admin/pricing` (ADR-803). Nothing here charges: a founding rate is a
locked display value, and the money flip is still the master switch.

- **Founding rates** (`Founding rates` section). The one-time **Founding Member** rate and seat cap, and
  the **Founding Business** locked monthly, bought-down marketplace fee, and per-city cap. Saved to the
  `founding` `pricing_settings` key.
- **Operator seat** (`Catalog` > `Operator seat`). Set the seat price, then flip **Seat activation** on.
  While it is off, the seat is a placeholder the catalog sync skips (no Stripe price is minted). Turning
  it on drops the placeholder so the next **Sync the catalog to Stripe** mints the live seat price from
  the amount you set. Activation is audited in `platform_flag_events`.
- **Member take-rate** (`Plans and prices` > `Take-rate`, the **Member %** field). The rate on a **Crew**
  member's network-sourced Market sale (default 8%); their own audience is 0% regardless, and a
  Business Space buys the network rate down to 5%. A free Member has no rate because a free Member
  cannot sell.
- **Beta controls** (`Beta controls` section). The **invite gate** (`beta_invite_only`) and **host
  prompts** (`beta_host_prompts`) switches, both audited, plus the **countdown date** (`beta_ends_at`).
  The countdown date is **display only**: it drives the "Summer of Frequency" banner and grants no
  access on its own.
