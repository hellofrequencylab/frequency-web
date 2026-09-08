# The offer model: free to belong, paid to build, exposure that is earned

> **Status: PROPOSAL, awaiting an owner ruling.** Nothing here is decided. Status for any work it
> produces lives in [`BUILD-BACKLOG.json`](BUILD-BACKLOG.json), never in this file.
> Filed 2026-09-08. Companion to [`FOCUS-MODEL.md`](FOCUS-MODEL.md), which establishes the findings
> this model rests on. Decision record, once ruled: [ADR-1293](DECISIONS.md).
>
> **This document explains an offer. It does not track whether the offer is built.**

---

## The model in one paragraph

**Everything is free to be part of. Businesses pay one price for the software that runs their
community. Nobody can buy exposure. You earn it by gathering people.**

One price. One earned thing. One promise. Every part of it is already in the codebase in some form,
and the single highest-leverage change in the whole plan is one `ORDER BY`.

---

## 1. Why this shape

The brief has four constraints that most pricing models cannot satisfy together: *everyone included
and getting real value free*, *a serious income stream*, *no gatekeeping*, and *the more a Space
contributes to community, the more exposure it gets*.

They only reconcile if you separate the two things a platform can sell, and then refuse to mix them:

| The scarce thing | Who wants it | How it is allocated |
|---|---|---|
| **Software** — CRM, campaign email, automation, a real site, memberships, a shop, seats | Businesses | **Sold.** One price. |
| **Exposure** — the directory, the map, the calendar, the feed, the city pages, the digest | Everyone, businesses most | **Earned. Never sold, at any price.** |

The moment exposure is purchasable, this is a directory with ads and the mission is decoration. The
moment exposure is *earned by gathering people*, the thing a business most wants is bought with the
behaviour the mission most wants. **The business model and the mission stop competing and become the
same mechanism.**

Everything below is detail.

---

## 2. The finding that makes this cheap

Two facts, both measured in the tree today.

🔴 **Fact one: the Space directory is sorted alphabetically.**

`lib/spaces/discovery.ts:135` defaults the sort to `name`, and `:378-380` applies
`.order('name', { ascending: true })`. Three sorts exist: name, newest, member count. **The most
valuable exposure surface a business has on this platform rewards nothing except starting with the
letter A.**

✅ **Fact two: nothing on the platform can be bought into rank. Anywhere.**

An audit of every ranking surface — the directory, all ten `/discover` families, `/nearby` and its
map, `/events`, the calendar, `/search`, the feed, `/network`, `/market`, `/library`, the rail panels,
the digest and the sitemap — found **no plan, tier, entitlement or Stripe field in any `ORDER BY`,
score, or inclusion filter.** The directory's only inclusion gate is `network_connected`, which is the
ADR-811 world switch and defaults to true.

Better still, **almost every surface already ranks on something earned**: member counts, adoption
counts, completions, ratings, co-presence, recency, distance. Two scoring formulas already ship:

- `practices_ranked`: `score = logs_30d*3 + adopters*2 + logs_total`
- `community_library`: `score = 3*adoptions + 2*completions + 4*ratings + freshness + endorser_order*0.8`

**So the promise "you cannot buy your way up" is already true, and a Space score is the third instance
of a pattern this repo has already built twice.** The work is to state the promise, defend it, and
give Spaces the same treatment content already gets.

---

## 3. What is free, permanently, for a person

**A member never pays for anything.** Not a feature, not a limit, not a badge.

Profile and Spotlight · Circles · Events and RSVPs · Practices · Journeys · Messages · Marketplace ·
the Quest, all of it · selling their own tickets and taking donations and getting paid.

- Retire the five member-facing feature gates in `lib/pricing/gates.ts` and the three tease-gates.
- **The real work is the parallel hard walls**, not the gates. `featureAllowed` short-circuits to
  "granted" while `gatesLive` is false, so those gates are not currently refusing anyone. The
  `isPaid(...)` checks in entry points, marketing codes, DM rooms, journey publishing and
  `lib/core/capabilities.ts` **are live right now** and are the only things actually saying no.
- Un-gate practice authoring, which is Crew-only today (`lib/core/capabilities.ts:229`).
- **Keep Crew** as contribute-what-you-want patronage with **no feature difference at all**. It already
  carries the honest name in the canon: *contribute what you want, never pay what you want*. Someone
  who chips in gets a thank-you, not an advantage.

**Why give it all away.** With 58 profiles, consumer subscription revenue is a rounding error, and the
member is the inventory: every member is the reason a business pays. Charging them taxes the supply
side of your own marketplace.

---

## 4. What is free for a business

**A Space is free, listed, findable, and can take money on day one.**

In the directory, on the map, in the calendar, on the city pages. Run events. Take RSVPs. Sell event
tickets. **Sell memberships.** Run circles. Get paid to its own Stripe account.

Free changes the take-rate and the depth of the tools. **Never permission.**

> This applies the repo's own rule to the one place it was never applied. ADR-914 already says
> *"never gate the transaction, gate the repeat"*, and already lets a free Member sell tickets and take
> donations day one. Recurring memberships are walled behind a $29/mo plan (`lib/pricing/gates.ts:144`;
> free Spaces get zero tiers), which is the exact inverse, and it walls the thing we most want to grow.

**The gate's defence, answered rather than dismissed.** Its comment argues a monthly membership *"is a
promise to another person"*, and helping someone make that promise from an account they might abandon
is not a feature. That is true, and it is a **readiness** concern, not a pricing one. Test it directly:
a payout-ready Connect account, a published circle to deliver into, a stated cancellation policy.
Readiness is testable. A price is only a proxy for it.

---

## 5. What a business pays for

One tier. One price. Everything.

| | Price | What it is |
|---|---|---|
| **Member** | **$0** | Everything, forever. |
| **Space** | **$0** | Listed, findable, gather, sell. 10% on network-sourced sales only. |
| **Business** | **$49/mo · $490/yr** | Every tool. 3% network rate. 3 seats. |
| Non Profit | $29/mo, verified | The same tools. 0% network rate. |
| Independent | $249/mo | Off-network white-label. The anchor, unchanged. |

Two prices lead the page: **free, or $49.** The other two are footnotes for the two cases that need
them.

**What $49 buys, all shipped software:** the CRM with unlimited contacts · campaign email and the block
email editor · marketing automation and drip sequences · unlimited membership tiers and dues · the
multi-page site and custom pages · the shop and storefront · unlimited circles · unlimited QR codes and
capture links · collaborators and revenue splits · 3 operator seats · the ticketed inbox · Vera.

### What is genuinely worth $49, and what must not be claimed

The offer has to be true, so the inventory was audited rather than assumed.

**The differentiator, and it is a real one: every contact permanently remembers the exact door it came
through, and that door survives the person becoming a member.** A capture stamps an **immutable entry
point**, enforced by a DB trigger at one per contact. When that person later signs up, the lead is
*linked*, not copied, so the original door is still there. Consent never silently upgrades: a QR scan
or an event check-in is captured but **not** mailable; only a lead magnet, an unlocked offer or an
accepted warm intro is. And contacts are sealed per Space, so the same person can be a lead in two
businesses without either leaking into the other. (`lib/crm/lead-capture.ts`, ADR-624)

Nobody in the field can do this. Mindbody and Momence own the transaction, not the origin. Eventbrite
owns one event. Circle, Skool and Mighty Networks own a members list with no lead-source model and no
per-tenant sealed contact. **None of them can answer "this member walked in off the poster in the
window in March, and here is the proof, three years later."** That is the line the business offer
should lead with, because it is true and it is unique.

⚠️ **Do not claim, in any copy:** live SMS (the sender is refuse-first and no-ops without A2P
registration) · custom domains (zero references in the codebase) · the standalone external website (a
"coming soon" stub) · Space donations collecting money (v1 captures an ask, there is no Stripe path) ·
embeddable widgets · platform signup leads as a business's own lead list. Space *ticket tiers* are free
and RSVP only by design; paid ticketing runs through **event** ticket types, which is a different and
genuinely working path.

**Why $49, not $29 or $79.** Today's ladder charges $29 for part of that and $79 for the rest, and the
$79 half is exactly the half that makes community-building possible: automation, team, collaboration.
Walling those contradicts the model. One merged tier at $49 sits above the price that undersells the
stack and below the price that reads as an agency tool.

**Nothing is at risk in the merge.** Production today: 14 Spaces on `free`, **6 on `collective`, all
comped, and zero on `business`.**

**The math that makes it an income stream.** 100 paying Spaces is $4,900/mo. 500 is $24,500/mo. The job
of the exposure engine is to make the 500th Space want it as much as the first.

---

## 6. The take-rate, reduced to two numbers

> **We take 10% of sales the network brings you. We take nothing on your own people, ever. Pay for
> Business and the 10% becomes 3%.**

That is the whole commercial explanation, and both halves already ship.

- **0% on your own audience is a relationship, not a cookie.** Six signals, any one is enough: the
  buyer is the seller, follows the Space, is an active member, is in its CRM, is in the seller's own
  contacts, or has bought before. It **fails safe to 0%**, deliberately, because charging a fee we
  promised not to is unrecoverable. (`lib/commerce/seller-audience.ts`)
- **The buy-down is arithmetic anyone can check.** A Space doing $1,000/month in network-sourced sales
  saves $70 by paying $49. **The subscription pays for itself at about $700/month of business the
  network found them.** That is what makes a ladder feel fair: you can verify it with a calculator.
- Tips stay 0% on every tier, always.

Seven rungs become two, plus zero for non-profits. One constant,
`NETWORK_TAKE_RATE_DEFAULT` in `lib/billing/pricing-keys.ts:196`, and one seeded DB vector.

---

## 7. Exposure is earned, and it is the product

### The promise

> **You cannot buy your way to the top of Frequency. You get there by bringing people together.**

No sponsored listings. No boosted events. No paid "featured". Ever. Written onto the pricing page
beside the four existing brand promises, because a promise that is merely true in the code is worth
nothing until it is stated.

### What earns it

The design rule is that every input must describe **community that actually happened**, and must be
readable from tables that already carry data. Production is early-beta thin, so this matters more than
it sounds: `captures` is 0, so **check-ins do not exist yet**; `space_collaborations` is 0; `reports`
is 0, so there is **no moderation record**; `trust_scores` is 0; `space_reviews` has one row. A score
weighting any of those would read zero for every Space on the platform.

**So it ships in two rounds, and round one uses only signals with data in them.**

**Round one — four inputs, all populated today:**

| # | Input | Read from | Prod today |
|---|---|---|---|
| 1 | **Gatherings held** | `events.space_id` / `host_space_id`, published and past | 66 events |
| 2 | **People brought to the network** | `profiles.referred_by_profile_id`, `profiles.acquisition` first-touch, `qr_codes.space_id` → `qr_scans`, `signup_leads.attribution` | 14 / 30 / 43 codes / 15 scans |
| 3 | **Circles kept alive** | `circles.space_id` + `memberships` + activity | 7 circles |
| 4 | **Given to the commons** | `journey_plans.adopt_count` / `fork_of`, `practices` adopted by others | `practice.adopted` 70 |

**Round two — as the data arrives:** verified attendance (needs the attendance record, §9), collaboration
and co-hosting (`event_space_shares`, 4 rows today), reviews and response latency, a clean moderation
record.

**Input 2 is the one that answers "businesses bring the members".** It is also the one with the most
existing plumbing: referral attribution, QR scan attribution, first-touch acquisition and signup-lead
attribution are all already recorded.

### The anti-gaming rule is already written

`NAMING.md`'s **validated creation** says a creation payout lands only when an asset is first used by a
**distinct, established member**: email-verified, not the creator, not referred by the creator. It is
implemented at `lib/rewards/creation.ts` (`isEstablishedValidator`) and **fails closed** on any read
error.

**That rule should govern every input to the score, not just creation.** Alongside it the repo already
has: idempotency keys on `reward_grants`, `engagement_events` and `trust_signals`; rolling daily caps
(connector 25, referral 25, creation tokens 3); an **activation gate** that refuses to pay a referral
until the new member does something real; PostGIS proximity verification with signed node secrets; and
a self-dealing trigger. Nothing new has to be invented to make the score honest.

### Three properties that keep it honest

1. **It decays.** A rolling window, not a bank. You cannot earn it once and coast, and an incumbent
   cannot lock the top. A Space that starts today and runs three real gatherings outranks one that ran
   thirty last year and stopped. **That is what makes "no gatekeeping" structurally true rather than a
   slogan.**
2. **Every input is capped**, so no one can spam a single behaviour to the top.
3. **Money is not an input.** Not the plan, not spend, not the take-rate paid. If it ever becomes one,
   the promise is dead and so is the differentiator.

### What it changes

The one-line version: `.order('name')` becomes `.order('score')`.

The fuller version: order and inclusion on the Spaces directory, `/discover/spaces`, the map and
`/nearby`, city pages, the master calendar, the digest, the `featured_at` slots that already exist but
sit in almost no `ORDER BY`, and the weight the matching layer gives a Space.

### Where the operator sees it

`space.reach`, today "QR codes and insights", already sits in a `reach` family beside email. It becomes
the page that answers the only question a business actually has: **what did the network send me, and
what would send me more?**

It must show the receipt, not just the number: *"The network sent you 14 people and $420 this month.
Two more gatherings would move you up the Encinitas page."* A score without an explanation is a credit
rating. A score with a receipt is a coaching tool, and it is the reason someone opens the app on a
Tuesday.

> ⚠️ **Naming.** `NAMING.md` is locked and says a term it does not cover goes to OPEN QUESTIONS, never
> a guess. **"Reach" is PROPOSED, not canon.** It collides with the existing `family: 'reach'` grouping
> in the Space module catalog, which is arguably a consolidation rather than a clash. That is the
> owner's call and the canon's. Until it is ruled, ship the mechanic and say it in plain words: *the
> more you put in, the further you carry.*

---

## 8. Why a business brings its own people

The brief requires that businesses bring the members. The model has to make that obviously worth doing,
and it does, in one line:

> **Bring your people. Keep 100% of them, forever. The more you bring and the more you gather, the more
> of everyone else's people we send you.**

Every clause is true in code today. Bringing your list costs nothing and is never taxed, because
own-audience is relationship-based and permanent. Bringing them earns exposure. Exposure brings other
Spaces' members as leads. Leads become sales. Sales make the tools worth paying for.

**The subscription becomes the consequence of success rather than the price of entry.** That is the
difference between a ladder that feels fair and a toll that feels like rent.

---

## 9. What it costs to build — honestly

An earlier draft of this section said "weeks, not months" and understated the pricing half. The
measured estimate is below.

| Work | Size | Note |
|---|---|---|
| Remove the live `isPaid` walls and member gates | **L** | ~18 files. The gates are cheap (not currently biting); the walls are the real change. |
| Merge `collective` into `business` | **L** | ~23 source files, 2 migrations, 1 CI script. `spaces.plan` has **no** check constraint, so the backfill is trivial, and `LEGACY_PLAN_REMAP` already exists as the read-time narrowing pattern. |
| Memberships free: gate + meter + RLS + trigger + TS mirror | **M** | Four enforcement points, none of which reads the gate: `private.space_can_sell`, `enforce_circle_access_shape`, the `SPACE_SELLING_PLANS` TS mirror, and the members-only ticket gate. All four must land in one commit; a drift test guards them. |
| Take-rate to two numbers | **S** | One constant plus one seeded vector. |
| Pricing page, grid, comparison rows | **M** | The grid derives from the key sets, so much follows the merge. |
| Fix or retire the tests that pin the ladder by value | **L** | ~20 test files. Mechanical, unavoidable. |
| **The Space score** | **M–L** | The only genuinely new thing: a derived read model on the nightly `refresh-traits` cron, following the `resonance_density_cells` pattern, then wiring it into existing `ORDER BY` sites. |
| The operator receipt page | **M** | Rebuild `space.reach` around the score and what the network delivered. |

**Honest total: roughly 110–140 files, one to one and a half focused weeks for the pricing rework,
plus the score on top.** Not a day, not a month.

**The one real gotcha:** Stripe prices cannot be deleted, and the four `collective_base` price keys sit
in `FROZEN_SYNCED_KEYS`. Collapsing the tier needs a grandfathering path for any live subscriber, not a
delete. Today that is six comped Spaces, so **the cheapest moment to do this is now** and it gets more
expensive with every real subscriber.

**One thing must land first, and one has just landed:**

1. ✅ **The payment rails are proven, as of 2026-09-08.** `OWN-050` closed: the webhook destination was
   never misconfigured, it had simply never been sent a subscribed event, and one real `account.updated`
   now proves URL, signature verification, the deployed handler and the database write end to end. Live
   payouts went live the same day and the funds flow is pinned as destination charges on Express accounts
   ([ADR-1291](DECISIONS.md)). No payment event has arrived yet only because nothing has ever been sold.
   **This model no longer has a blocked revenue path; it has an unopened one.**
2. 🔴 **Give event attendance its own record.** There is no `checked_in` column; attendance exists only
   as an engagement-ledger row written by the same path that pays Zaps, and `captures` is empty. Round
   two of the score depends on it, and so does any change to the game's reward visibility.

---

## 10. The order to do it in

Sequenced so something visible ships in week one and nothing waits on a ruling it does not need.

| Order | Work | Why here |
|---|---|---|
| ~~0~~ | ~~Register the Stripe webhook~~ | ✅ **Done 2026-09-08.** `OWN-050` closed and live payouts went live the same day. The rails are proven. |
| **1** | **Change the directory sort from `name` to a score** | The single highest-leverage line in the plan. Ship it against a crude v1 score if need be; alphabetical is worse than anything. |
| **2** | Remove the live `isPaid` walls and member gates | Independent of pricing. Makes "free" true before 1 October. |
| **3** | Memberships free on readiness, not plan | Opens the dues engine, which is otherwise built and dark. |
| **4** | Merge the tiers, collapse the take-rate, rewrite the pricing page | The biggest single chunk. Cheapest now, while six comped Spaces are the only subscribers. |
| **5** | The Space score as a real derived model, round one inputs | Then wire it into the remaining `ORDER BY` sites. |
| **6** | The operator receipt page | Turns the score from a ranking into a reason to log in. |
| **7** | Attendance record, then round-two score inputs | Also unblocks the game demotion in `FOCUS-MODEL.md`. |

---

## 11. What the owner has to decide

| # | Ruling | Default if unanswered |
|---|---|---|
| 1 | Members never pay for a feature. Remove the walls. | The gates start biting on 1 October. |
| 2 | Merge Collective into Business at one price. Recommended **$49/mo**. | Seven rungs stay, and grandfathering gets more expensive with each subscriber. |
| 3 | Any Space may sell memberships, gated on readiness rather than plan. | The dues engine stays walled. |
| 4 | Exposure is earned and never purchasable, stated as a public promise. | It stays undefined, and the pressure to sell placement arrives with the first big operator. |
| 5 | Take-rate collapses to **10% free · 3% paid · 0% non-profit · 0% own audience always**. | Seven rungs stay. |
| 6 | The name for the earned thing, or a ruling to ship it unnamed. | It ships unnamed, which is survivable. |

**The date on the calendar:** `beta_grace` expires **2026-10-01**, after which the current gates
enforce against individuals for the first time. Rulings 1 and 2 need to land before then, or the window
needs extending.

---

## References

[FOCUS-MODEL.md](FOCUS-MODEL.md) · [ADR-811](DECISIONS.md) · [ADR-914](DECISIONS.md) ·
[ADR-552](DECISIONS.md) · [VALUE-LADDER.md](VALUE-LADDER.md) · [PRICING.md](PRICING.md) ·
[COMMUNITY-COLLECTIVE-STRATEGY.md](COMMUNITY-COLLECTIVE-STRATEGY.md) · [NAMING.md](NAMING.md) ·
[CONTENT-VOICE.md](CONTENT-VOICE.md) · [DISCOVER-LAYER.md](DISCOVER-LAYER.md) ·
[ENGAGEMENT-ARCHITECTURE.md](ENGAGEMENT-ARCHITECTURE.md) · [SPACES.md](SPACES.md)
