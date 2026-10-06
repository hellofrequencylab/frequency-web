# How the money works (operator guide)

Plain-language operator reference for pricing, payments, and the switches that control them. Technical
source of truth stays in the code + `docs/DECISIONS.md`; this is the "how do I run it" companion.

There are two separate money flows. Keep them straight.

## 1. Plan billing (money in)

Members and Spaces pay Frequency for a plan. The ladder is five tiers, one verb each ([ADR-1709](DECISIONS.md),
2026-10-06): **members join, Crew hosts, a Space runs, Business sells, Collective connects.** Every
yearly price is ten months of the monthly. Prices live in the catalog (`/admin/pricing`, Catalog) and
every surface reads them from there, so this table names who buys what and never the amount. The
amounts the owner ruled are recorded in [PRICING.md](PRICING.md), top banner. Status lives in
[`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json).

| Plan | Who buys it | What it is for |
|---|---|---|
| **Member** | everyone | Free. Joins Circles and Events, hosts 1 Circle and 2 upcoming free Events |
| **Crew** | a member | **Contribute what you want** above a floor. Backing the community plus a host kit |
| **Space** (free) | any member | Every hosting tool with launch limits, tips at 0%. Does not sell |
| **Business** | a Space | Selling opens here. Higher limits, 2 operator seats |
| **Collective** | a Space | Business for a group of groups: 5 member Spaces included, more at the extra-Space price, Vera AI included, a lower network fee |
| **Non Profit** | a verified 501(c)(3) Space | Everything Business does, with no network fee. Non Profit Collective is the Collective version |
| **Independent** | a Space going white-label, off the network | Hand-sold, never on a public surface |

**Vera AI** is the add-on on Business and Non Profit (included in Collective). Operator seats beyond
the included ones are a priced add-on. The supporter mark is not a tier.

The Founding Business 3% buy-down stays for Spaces already in it, and the six hand-granted Business
Spaces stay Business (ADR-1709 owner defaults).

All of this bills through Stripe subscriptions and one-time payments.

### Plan capabilities to know when members ask

| Capability | Plan floor | The rule |
|---|---|---|
| Selling | Business (Non Profit and Collective clear it) | Paid tickets, paid memberships, donations, shop checkout, booking deposits and priced Journeys need the `space_payments` gate (`LIVE-753`). It does not wait for `beta_grace`. A refusal shows what Business adds and offers its 14-day trial in place, with "keep it free" as an equal choice. |
| Tips | every tier | Open at 0%, always. The only money a free tier receives. |
| Collaborator hosting | Business (meter `space_collaborators`) | Hosting WITH Collaborator Spaces is metered on the host Space (`PLACEHOLDER_METER_LIMITS.space_collaborators`). Being a Collaborator on someone else's event stays free on every plan. |
| Count limits | per meter | One map, `lib/pricing/meter-limits.ts`. A full meter only stops new writes; nothing is hidden, deleted or locked. |

## 2. Payouts (money through)

When a member tips a host, or a Space sells a ticket, membership, booking or product, the money goes
to that host or Space through **Stripe Connect**. The rules ([ADR-1709](DECISIONS.md)):

1. **Tips carry no platform fee. Zero, on every tier.** A tip is a gift between two people; we are not
   in it.
2. **Selling starts at Business.** Personal accounts and the free Space do not sell; they take tips.
   ADR-914's "anyone can sell, on any tier" is superseded.
3. **A sale to the seller's own audience costs them nothing.** Always 0%.

Every order that is not a tip is classified as `self` (the seller's own audience) or `network` (the
network sourced it: referral, discovery, the marketplace). **Own-audience is a relationship, not a
cookie**: the buyer follows the Space, is on its team or holds an active membership in one of its tiers
([ADR-1600](DECISIONS.md)), is in its Space Contacts, or has bought from it before
([ADR-1584](DECISIONS.md)). Any one of those makes the order `self` and the fee 0%. A network customer
is charged once, at their first purchase; after that they are the Space's people.

| Seller | Network fee (first purchase only) | Own audience |
|---|---|---|
| Member, Crew, free Space | does not sell (tips only) | 0% |
| Business | 5% | 0% |
| Collective | 3% | 0% |
| Non Profit, Non Profit Collective | 0% | 0% |
| Independent | 5% in code, but off the network, so no network sales | 0% |
| Tips, any tier | **0%** | **0%** |

The free and personal rungs stay in code only as default-deny values (`LIVE-754`). The rates are set in
the pricing console (`/admin/pricing`, Take-rate); the seeded defaults live in
`NETWORK_TAKE_RATE_DEFAULT` (`lib/billing/pricing-keys.ts`, mirrored by `lib/pricing/defaults.ts`). A
paid rung is never framed as buying a rate down (ADR-1350).

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
  gates start blocking, set to **2026-12-01** (kept by ADR-1709). Until it arrives, billing can be fully
  live while every member and Space keeps room past the free limits. On that date at 00:00 UTC the count
  limits start biting, with no further operator action. The `space_payments` selling gate is the
  exception: it does not wait for this date. Clearing the field means "no grace window": paid features would lock the moment
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

## The beta setup (history: the "free until Sept 1" window, moved to 1 December by ADR-1709)

Where things stand today, in one paragraph: **nobody is charged.** The master switch
(`billing_live`) is **off**, and the code-side preview switch `PLACEHOLDER_PRICING`
(`lib/pricing/feature-tiers.ts`) is **on**, which marks every pricing surface as a preview.
Plan ladders, allowance meters, and upgrade buttons all render with real catalog numbers, but
every CTA only navigates; nothing checks out. Going live is a deliberate two-part flip: set the
Stripe keys and turn `billing_live` on at `/admin/pricing`, and have an engineer flip
`PLACEHOLDER_PRICING` to false.

On top of that, three beta pieces are currently set:

- **The paid-gates date (`beta_grace`) is `2026-12-01`** (it was `2026-09-01`; ADR-1709 kept the moved
  date). Count limits do not begin until that date, and no action is needed on the day: they turn
  themselves on at 00:00 UTC. Selling is not part of this window: the `space_payments` gate refuses a
  free Space from the day it ships.
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
- **Founding Businesses.** ⚠️ There is no beta rate to buy at any more ([ADR-1060](DECISIONS.md)): a
  Space subscribing today pays the catalog list price. The grandfather mechanism itself is unchanged (a locked Stripe
  price id on the subscription item), and `FOUNDING_DEFAULT.business_monthly_cents` is still **$19**, so
  the beta-founder grant still stamps a $19 lifetime rate that nothing sells. Whether that stays is an
  open owner decision. The locked Founding Business display values are edited under `Founding rates`.
- **Business plan (ongoing).** A Space owner buys it from their Space billing settings once the plan is
  enabled and billing is live. It includes a trial with a card upfront. Business is where selling opens
  (ADR-1709); the free Space is a real plan with every hosting tool.
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
- **Member take-rates** (history: ADR-1709 turned personal selling off, so these two fields are
  default-deny values only) (`Plans and prices` > `Take-rate`, the **Free member %** and **Member %**
  fields). The rate on a member's network-sourced sale: **Free member %** is what a free Member pays
  (default 10%) and **Member %** is the Crew rate (default 8%); their own audience is 0% regardless.
  ~~A free Member has no rate because a free Member cannot sell.~~ (Corrected 2026-08-19,
  [ADR-914](DECISIONS.md): a free Member sells on day one, and the free rung is editable in the console
  — `member_free_bps`, `app/(main)/admin/pricing/pricing-console.tsx`.)
- **Beta controls** (`Beta controls` section). The **host prompts** (`beta_host_prompts`) switch,
  audited, plus the **countdown date** (`beta_ends_at`). The countdown date is **display only**: it
  drives the "Summer of Frequency" banner and grants no access on its own. An **invite gate**
  (`beta_invite_only`) sat here too and could close signup to admitted waitlist contacts only; it was
  removed with the waitlist (ADR-933), so there is no longer a switch that can close signup.
