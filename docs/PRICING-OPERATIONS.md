# How the money works (operator guide)

Plain-language operator reference for pricing, payments, and the switches that control them. Technical
source of truth stays in the code + `docs/DECISIONS.md`; this is the "how do I run it" companion.

There are two separate money flows. Keep them straight.

## 1. Plan billing (money in)

Members and Spaces pay Frequency for a plan.

- A **Space** buys **Business** ($49/mo, $490/yr with two months free) or **Non Profit** ($29/mo).
- A **member** can add a **Supporter** contribution (pay what you want, $5 minimum) to support the cause,
  or buy **Crew** ($9/mo under a $12 anchor) when that tier is turned on.
- **Founding Members** pay a one-time **$250**, locked for life.

All of this bills through Stripe subscriptions and one-time payments.

## 2. Payouts (money through)

When a member tips a host, buys an event ticket, or buys from a Space storefront, the money goes to that
host or Space through **Stripe Connect**. Frequency keeps a platform fee (the **take-rate**) off the top:

| Seller | Take-rate |
|---|---|
| Free Space | 5% |
| Paying Business | 3% |
| Non Profit | 3% |
| Individual member on the Market | 8% |

Upgrading a Space to Business buys the fee down from 5% to 3%. The take-rate is set in the pricing console.

## Turning payments on and off

Everything ships **off**. Each switch is at `/admin/pricing` unless noted. Every flip is audited (who,
when, old to new) in `platform_flag_events`.

- **`billing_live` (the master switch).** The one switch that turns billing on. While it is off, nobody is
  charged and everyone keeps full access. It only takes effect when the **Stripe keys are also set** in
  the environment.
- **`plan_business_enabled` / `plan_nonprofit_enabled`.** Show and sell each Space plan. A plan sells only
  when its switch **and** the master switch are both on.
- **`tier_crew_enabled` / `tier_supporter_enabled`.** The same for member plans.
- **`host_payouts_enabled`** (at `/admin/payments`). Turns the tips, ticket, and storefront payout
  marketplace on. Off means none of those payment controls appear anywhere.
- **The feature gates** (`/admin/pricing`, Feature gates). Each paid feature names the plan it needs. A gate
  that is turned **off** never blocks. This is the lever for "free during beta": with billing live but the
  paid gates disabled, every member keeps paid features for free.

## The beta "free until Sept 1" setup (current state)

Two independent pieces, both currently on:

- **The paid feature gates are turned off**, so every member and Space keeps paid features for free even
  though billing is live and plans are for sale. On September 1 you turn the gates back on and paid
  features lock to paying members.
- **The countdown clock (`beta_ends_at`)** is set to `2026-09-01`. It drives the "Summer of Frequency ends
  Sept 1" banner only; it changes nothing about access on its own.

To lock paid features on Sept 1: re-enable the feature gates in `/admin/pricing` (turn each back on), and
turn `gamification_full_member` back off.

## Setting prices and syncing to Stripe

1. Edit the price in `/admin/pricing`. The Catalog section holds the live prices (Business base, AI Engine,
   Non Profit). Each shows a list anchor and the lower founding price that is actually charged. The yearly
   is two months free unless you override it.
2. Save. Nothing is charged by saving; you are only editing config.
3. Press **Sync the catalog to Stripe**. This creates or updates the Stripe products and prices. It is
   safe to run while billing is off, and it is idempotent, so running it twice does nothing extra. Stripe
   prices are immutable, so a price change creates a new Stripe price and archives the old one.

## How Founding Members and the Business plan are sold

- **Founding Members (personal).** A one-time purchase at `/founders`: Founding Supporter ($25), Founding
  Member ($250, locked for life, capped at the first 150), and Founding Patron ($1,000). Inert until
  `billing_live` is on. A paid Founding Member is flagged for life and grandfathered at their rate.
- **Founding Businesses.** The founding Business rate is **$49/mo, $490/yr** (matching the live Business
  plan), with a bought-down 3% marketplace fee and a per-city cap of 25. A Space that buys the Business
  plan now is grandfathered at that price for the life of its subscription.
- **Business plan (ongoing).** A Space owner buys it from their Space billing settings once the plan is
  enabled and billing is live. It includes a trial with a card upfront. Business is the full-depth tier;
  free is a usage state within Business, not a separate plan.

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
- **Member take-rate** (`Plans and prices` > `Take-rate`, the **Member %** field). The rate on an
  individual member's Market sale (default 8%); a Business subscription buys it down.
- **Beta controls** (`Beta controls` section). The **invite gate** (`beta_invite_only`) and **host
  prompts** (`beta_host_prompts`) switches, both audited, plus the **countdown date** (`beta_ends_at`).
  The countdown date is **display only**: it drives the "Summer of Frequency" banner and grants no
  access on its own.
