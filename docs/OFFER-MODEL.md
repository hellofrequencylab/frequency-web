# The offer model: everything freemium, paid to scale, exposure that is earned

> **Status: PROPOSAL, carrying five owner rulings taken 2026-09-08.** The rest is not decided.
> Status for any work it produces lives in [`BUILD-BACKLOG.json`](BUILD-BACKLOG.json), never in this
> file. Companion to [`FOCUS-MODEL.md`](FOCUS-MODEL.md). Decision record, once ruled:
> [ADR-1293](DECISIONS.md).
>
> **This document explains an offer. It does not track whether the offer is built.**

---

## The model in one paragraph

**Every tool is available to every Space, with freemium caps. Paying lifts the caps and adds seats.
Nobody can buy exposure. You earn it by gathering people.**

No feature is ever withheld. A free Space can reach for anything; it just runs out of room sooner.
That makes the product one product instead of five, and it makes the upgrade an obvious yes rather
than a wall.

---

## The five rulings this is built on

| # | Ruling | Consequence |
|---|---|---|
| 1 | **Everything freemium.** Every tool turn-on-able by every Space, with caps. A new Space starts with core tools on and the rest off but available. | Five caps currently sit at **zero** on free and must move. See §3. |
| 2 | **Members consume, Spaces create.** A member gets every forward-facing feature free; creating things is what a Space does. | Five member gates move or retire. See §2. |
| 3 | **Crew is granted by an active paid membership to a community**, at any price. | Crew stops being sold by the platform. See §4, including one risk you should see. |
| 4 | **$49 core, 2 seats included, +$12 per extra seat.** | Seats are the size axis. Already built; needs a price and a flag. |
| 5 | **Exposure is earned: ordering plus the four dormant featured slots.** | No migration needed for the featured half. See §6 and §7. |

---

## 1. Why this shape

Two things a platform like this can sell: **the software** and **the attention**. Sell the software.
Never sell the attention. Then the thing a business most wants is bought with the behaviour the
mission most wants, and the business model stops competing with the mission.

Two measurements make it cheap rather than speculative.

🔴 **The Spaces directory is sorted alphabetically.** `lib/spaces/discovery.ts:135` defaults the sort
to `name`; `:378-380` applies it. The most valuable exposure surface a business has rewards nothing
except starting with the letter A.

✅ **Nothing here can be bought into rank, anywhere.** An audit of every ranking surface found no
plan, tier, entitlement or Stripe field in any `ORDER BY`, score or inclusion filter. Almost
everything already ranks on something earned, and **three scoring formulas already ship**
(`practices_ranked`, the `community_library` RPC, `lib/feed/blend-rank.ts`). A Space score is the
fourth instance of a pattern this repo has built three times.

---

## 2. What a member gets, and where creation lives

**A member never pays for anything, and gets every forward-facing feature.** Browse, join, attend,
RSVP, message, follow, buy, sell their own tickets, take part in the Quest.

**Creating is what a Space does.** That boundary mostly exists already: `event.create`,
`circle.create` and `journey.create` are open to any signed-in member today, and Space-scoped
practice creation already bypasses the member gate
(`app/(main)/spaces/[slug]/practices/actions.ts:49-61`) — the shape of Ruling 2 is shipped, just not
generalised.

**Five things are member-gated today and are the ones this ruling touches**
(`lib/core/capabilities.ts:228-231` and the parallel walls):

| Gated today | Where | Under Ruling 2 |
|---|---|---|
| `practice.create` | `capabilities.ts:228` | A Space capability, or granted Crew |
| `spotlight.enable` / `spotlight.view` | `capabilities.ts:255-267` | Free to every member |
| Entry points | `entry-points/actions.ts:50-56` | A Space capability |
| Marketing codes / QR studio | `codes/actions.ts:41-46` | A Space capability |
| Message rooms | `messages/rooms/actions.ts:29-35` | Free to every member |

⚠️ Three of those five (`entry-points`, `codes`, `rooms`) are **live walls today** — they refuse
people right now, unlike the feature gates, which short-circuit to granted while `gatesLive` is
false. They are the real work.

---

## 3. Everything freemium: the caps

Every one of the 22 Space functions is already **universal and default-on** in the resolver
(`lib/spaces/functions.ts:334-340`). Only four carry an entitlement. So "every tool available" is
almost the shipped state — what has to change is the **caps**, five of which currently read zero and
therefore act as locks rather than allowances.

| Meter | Free today | Free proposed | Note |
|---|---|---|---|
| `space_automation` | **0** | **50 runs/mo** | A lock today. A taste is enough to learn from. |
| `space_crm_playbooks` | **0** | **100 runs/mo** | A lock today. |
| `space_collaborators` | **0** | **1** | One partner proves the idea. |
| `space_membership_tiers` | **0** | **1** | The dues engine opens to everyone. See §5. |
| `practice_publish` | **0** | **3** | Was Crew-only. |
| `space_crm` (contacts) | 200 | **200** | Unchanged. Never cap members or contacts further. |
| `space_email` | 300/mo | **300/mo** | Unchanged. |
| `space_qr` | 3 | **3** | Unchanged. |
| `space_bookings` | 15/mo | **15/mo** | Unchanged. |
| `space_tickets` | 50 | **50** | Unchanged. |
| `space_journey_publish` | 1 | **1** | Unchanged. |
| `space_team` | 1 | **1** | The seat axis starts here. |

**Paid lifts every cap** except where a hard number protects the platform (email throughput, AI
spend). This is the live doctrine already: *cap depth, scale, seats and collaboration; never contacts
or members.*

**The setup shape.** A new Space starts with a **core set on and the rest off but switchable**. That
is `CAPABILITY_BUNDLES` (`lib/pricing/bundles.ts`) used as an onboarding preset rather than a
paywall — which is exactly what it can do, because **bundles are subtractive only**: they can turn a
tool off for a Space, never grant a paid one. Presets named for what someone runs (a studio, a
practice, a venue, a non-profit) make a 22-tool console feel like a five-tool one on day one, and
every hidden tool is one switch away.

✅ **This closes an open P1 owner row.** `OWN-048` says: *"before any bundle ships, write a full spec
per bundle and review the function registry at the same time."* The mechanism is built and proven and
holds exactly one pass-through row. This section is the spec it is waiting for.

---

## 4. Crew, granted by a community

**Ruling: an active paid membership to any Space grants Crew, at any price.** Crew stops being
something the platform sells and becomes something a community confers.

Two facts shape how it must be built:

- **Crew is a *tier*, not a role.** `profiles.community_role = 'crew'` is retired and a documented
  no-op (`lib/core/roles.ts:24-30`). This is a `membership_tier` question.
- **`membership_tier` is a bare scalar with no provenance.** Circle memberships carry
  `granted_by_tier_id` precisely so a grant can be revoked without touching a membership someone
  chose themselves. A naive Crew grant would downgrade a member who *also* pays Stripe directly.
  **Give the grant provenance**, either as a small `crew_grants` table or by copying the existing
  `household_bundle_prior_tier` restore pattern (`lib/billing/bundle-invites.ts:6-15`), and make the
  effective tier `stripe_active OR EXISTS(active grant)`.

The grant and revoke sites already exist as a set — `joinTier`, `promoteMembership`,
`cancelMembership`, and three arms of the Stripe reconciler — because `syncTierCircleAccess` already
walks all six. A `syncTierCrewGrant` sibling goes beside it.

### 🔴 One risk you should decide on explicitly

The ruling is "any paid membership, any price", and today **nothing stops a self-grant**. Anyone can
create a Space (the first is free even when gates are live), `setMembershipTiers` has **no minimum
price check** (`lib/spaces/memberships.ts:415`), and `prevent_economy_self_edit` does **not** cover
`membership_tier`. So an operator can mint a $1 tier and grant themselves and their friends Crew.

Two narrow guards would preserve the ruling while closing the hole, and **both are recommendations,
not decisions**:

1. **A granted Crew does not buy down the platform take rate.** Keep `memberNetworkTakeRateBps`
   reading the *Stripe* tier. Otherwise a $1 tier is a machine for turning 10% into 8%.
2. **Exclude the Space's own owner and admins from being granted by their own tier.** One line at the
   grant site.

Everything else Crew unlocks — creation rights, publish allowances, the Vault — is fine to hand out,
because handing it out is the point.

---

## 5. The money

| | Price | What it is |
|---|---|---|
| **Member** | **$0** | Everything forward-facing, forever. |
| **Space** | **$0** | Every tool, freemium caps. Listed, findable, gather, sell. |
| **Business** | **$49/mo · $490/yr** | Caps lifted. **2 seats included.** |
| **Extra seats** | **+$12/mo each** | The size axis. Max 25. |
| Non Profit | $29/mo, verified | Same, 0% network rate. |
| Independent | $249/mo | Off-network. The anchor, unchanged. |

**Small businesses get big tools; larger businesses pay more** — through seats and usage, not through
locks. A solo practitioner pays $49 and has automation, CRM, email, memberships and a shop. A
six-person studio pays $97 for the same tools and the room to use them.

**$12 is the number ADR-811 already names.** The $9 in `lib/billing/pricing-keys.ts` is a documented
placeholder that the catalog sync deliberately skips. Seats are otherwise **fully built**: the
checkout line, the webhook reconciler, the seat editor and the invite check all exist. Turning them
on is: set the amount, clear `placeholder`, run the catalog sync, flip `catalog_operator_seat_active`.

### The take-rate, in two numbers

> **We take 10% of sales the network brings you. We take nothing on your own people, ever. Pay for
> Business and the 10% becomes 3%.**

Own-audience is decided by relationship, not a cookie: six signals, any one is enough, and it **fails
safe to 0%** because charging a fee we promised not to is unrecoverable
(`lib/commerce/seller-audience.ts`). The buy-down is checkable arithmetic: a Space doing about
**$700/month** in network-sourced sales saves more in rate than the subscription costs.

**Memberships open to every Space.** Today `lib/pricing/gates.ts:144` walls them behind Business and
gives free Spaces zero tiers — the exact inverse of ADR-914's *"never gate the transaction, gate the
repeat"*. Under Ruling 1 a free Space gets one tier. The gate's own defence, that a monthly
membership *"is a promise to another person"*, is a **readiness** concern rather than a pricing one,
and readiness is directly testable: a payout-ready Connect account, a published circle to deliver
into, and a stated cancellation policy. That is what "gated on readiness rather than plan" means, and
it is the honest version of the wall.

**Nothing is at risk in the merge.** Production carries 14 free Spaces, 6 on Collective **all
comped**, and **zero** on Business. Stripe prices cannot be deleted and the `collective_base` keys
are frozen, so collapsing the tier needs a grandfathering path — today that is six comped Spaces,
which makes **now the cheapest moment this will ever be.**

---

## 6. Earned exposure: the promise and the levers

> **You cannot buy your way to the top of Frequency. You get there by bringing people together.**

No sponsored listings, no boosted events, no paid featured. Stated on the pricing page beside the
existing brand promises, because a promise that is only true in the code is worth nothing.

### The levers in this round

**Ordering — replace a sort that rewards nothing:**

| Surface | Today | Becomes |
|---|---|---|
| Spaces directory + `/discover/spaces` | `name` A–Z | Standing score |
| `/discover` home sections | plain `limit` reads, unranked | Standing score |
| `/partners` | `name` A–Z | Standing score |
| Marketplace | `created_at desc` only | Standing-weighted |
| `/circles` index | name / member / created | Standing-weighted |

**The four dormant slots — already built, no migration, no consumer today:**

| Column | State | Becomes |
|---|---|---|
| `events.featured_at` | Selected in the query, documented as "a curated pick", **read by no sort branch** | Earned placement in `/events` |
| `circles.featured_at` | Badge only; the ordering intent was never realised | Earned placement in `/circles` |
| `journey_plans.featured_at` | Admin toggle only, **no public consumer at all** | Earned placement in the library |
| `practices.featured_at` | Admin facet counts only, **no public consumer** | Earned placement in the library |

⚠️ One hazard, already documented by a regression test: any new `featured_at` consumer must be added
to **every** select branch, or featured rows render unstarred
(`scripts/check-row-type-select-parity.test.ts:23-27`).

**Not in this round, but named so they are not lost:** earned inclusion in the weekly digest's three
dispatch slots (awarded by timestamp today, reaching every active member), the global dispatch slot,
city-page inclusion, and co-host invitations.

---

## 7. The sorting algorithm

Designed to look native: it borrows the saturation curve from `lib/resonance/score.ts`, the
weight-renormalisation and diversity re-rank from `lib/feed/blend-rank.ts`, and the rollup shape from
`resonance_density_cells`.

### The signals

Six, each saturated so the first unit counts most and no single axis can be farmed:

```
sat(n, k) = 1 - e^(-n/k)          // 1 unit at k ≈ 0.63, 2k ≈ 0.86, 3k ≈ 0.95

Gathered   G = sat(events_held_90d,        k=3)    weight 0.30
Upcoming   U = sat(upcoming_events,        k=2)    weight 0.15
Rooms      R = sat(active_circle_members,  k=12)   weight 0.20
Audience   A = sat(members + followers,    k=15)   weight 0.15
Commons    C = sat(adoptions_by_others,    k=3)    weight 0.12
Care       K = completeness ∈ [0,1]                weight 0.08
```

### The score

```
raw   = Σ(wᵢ · vᵢ) / Σ(wᵢ over PRESENT signals)     // renormalise, never penalise a missing signal
fresh = max(0.35, 0.5 ^ (days_since_last_activity / 60))
score = raw · fresh
```

Then two adjustments before the slice:

- **New-Space grace:** a Space younger than 30 days takes `max(score, 0.35)`. Endowed progress, and
  it matches the repo's own *unknown ≠ zero* rule (`lib/spaces/health.ts:115-117`).
- **Diversity re-rank:** at most **2 Spaces per owner profile** in the top band, overflow appended in
  score order. This is `diversityRerank(maxPerAuthor = 2)` from `blend-rank.ts:132-147`, applied to
  owners instead of authors.

When the viewer has a location, blend proximity in as `blend-rank` already does, at weight 0.25
against the standing score.

### Why these weights

Gathering people is the behaviour the whole model exists to reward, so it carries the most. Upcoming
is deliberately lower than held: **announcing is not gathering**, and a lower weight means posting
ten phantom events buys little. Care is small on purpose — a filled-in profile should break a tie,
never beat a real gathering.

### Anti-gaming

Reuse the rules that already ship rather than inventing new ones:

- **Cross-actor only.** A signal counts only when the actor is not a member of that Space. This is
  the shape of `isEstablishedValidator` (`lib/rewards/creation.ts:148-173`): not the creator, not
  invited by them, email-verified, and **fails closed** on any read error.
- **Deduped per actor per Space per day**, using the `engagement_events.idempotency_key` column that
  already exists.
- **Saturation is the cap.** `sat()` bounds every axis arithmetically, so no volume of any one
  behaviour can dominate.
- **Money is never an input.** Not the plan, not spend, not take-rate paid.
- **It decays.** The freshness term means standing cannot be banked. A Space that runs three real
  gatherings this quarter outranks one that ran thirty last year and stopped. That is what makes "no
  gatekeeping" structurally true rather than a slogan.

### Ship it in two steps

**v0, this week, no migration.** The directory query already fetches `memberCount`, `followerCount`,
`upcomingEventCount` (series-folded) and `created_at`, and pagination happens in **app code** — so a
score computed from what is already in hand can be applied before the slice with **no query change at
all**. That alone replaces alphabetical.

**v1, the real model.** A `space_standing` rollup table on the nightly `refresh-traits` cron
(`30 2 * * *`), copying `resonance_density_cells`: composite PK, a `score` column, `computed_at`, RLS
enabled with **no policies** so it is service-role only, and a `refresh_space_standing()` plpgsql
function that deletes and re-inserts through CTEs and returns its row count.

### A caution about the data

Production is thin, and a formula that ignores this reads zero for almost everyone. Of 20 networked
Spaces: **8 have any published event, 4 have an upcoming one, 1 has a circle, 7 have a follower, 0
have a paid membership.** The only dense, universal signal is profile views — 342 in the last 30 days
across **20 of 20** Spaces. That is why the renormalisation rule matters more than the weights: it
lets a Space be judged on the signals it actually has.

### Where the operator sees it

`space.reach` — today "QR codes and insights" — becomes the page that answers the only question a
business really has: **what did the network send me, and what would send me more?** It must show the
receipt, not just the number. A score without an explanation is a credit rating; a score with a
receipt is a coaching tool.

---

## 8. What a business actually gets

Audited rather than assumed, because the offer has to be true.

**The differentiator is real and unique: every contact permanently remembers the door it came
through, and that door survives the person becoming a member.** A capture stamps an immutable entry
point, enforced by a database trigger at one per contact; when that person signs up the lead is
*linked*, not copied. Consent never silently upgrades — a QR scan or a check-in is captured but not
mailable. Contacts are sealed per Space, so the same person can be a lead in two businesses without
either leaking into the other.

Mindbody and Momence own the transaction, not the origin. Eventbrite owns one event. Circle, Skool
and Mighty Networks own a members list with no lead-source model. **None of them can answer "this
member walked in off the poster in the window in March, and here is the proof, three years later."**

⚠️ **Do not claim, in any copy:** live SMS (the sender is refuse-first and no-ops without carrier
registration) · custom domains (no references in the codebase) · the standalone external website (a
"coming soon" stub) · Space donations collecting money (v1 captures an ask; there is no payment path)
· embeddable widgets · platform signup leads as a business's own lead list. Space *ticket tiers* are
free and RSVP-only by design; **paid ticketing runs through event ticket types**, which is a different
and genuinely working path.

---

## 9. Cost and order

Measured, not estimated. Roughly **110–140 files** for the pricing rework, **one to one and a half
focused weeks**, plus the standing score.

| Order | Work | Why here |
|---|---|---|
| **1** | **Directory sort: `name` → v0 standing score** | Highest leverage line in the plan, no migration, no query change. |
| **2** | Remove the three live walls (entry points, codes, rooms) and the member gates | Independent of pricing. Makes "free" true. |
| **3** | Move the five zero caps off zero | Makes "everything freemium" true. One constant. |
| **4** | Memberships open to every Space, on readiness | Opens the dues engine, otherwise built and dark. |
| **5** | Merge the tiers, seats live at $12, take-rate to two numbers, rewrite pricing | The big chunk. Cheapest now, while six comped Spaces are the only subscribers. |
| **6** | Wire the four dormant `featured_at` slots | No migration. Watch the select-parity hazard. |
| **7** | `space_standing` rollup + the operator receipt page | The real model, and the reason to log in on a Tuesday. |
| **8** | Bundle presets as the setup shape | Closes `OWN-048`. |

**Already done, and worth knowing:** the payment rails are proven. `OWN-050` closed on 2026-09-08 —
the webhook was registered and correct all along, it had simply never been sent a subscribed event,
and one real event now proves the whole chain. Live payouts went live the same day and the funds flow
is pinned as destination charges on Express accounts ([ADR-1291](DECISIONS.md)). **No payment event
has arrived yet only because nothing has ever been sold.**

**Still blocking part of §7:** event attendance has no independent record. There is no `checked_in`
column; attendance exists only as an engagement-ledger row written by the same path that pays Zaps,
and `captures` is empty. A "gatherings held" signal that means *people actually turned up* needs it.

---

## 10. Still open

1. **The two Crew guards in §4** — take-rate reads the Stripe tier; owners cannot self-grant. Both
   recommended, neither ruled.
2. **The grace window.** `beta_grace` currently expires 2026-10-01. Since the model is being
   re-engineered, propose moving it to **2026-12-01** — far enough to build steps 1 through 5, near
   enough to stay real.
3. **A name for the earned thing.** The mechanic works unnamed. A name helps an operator care about
   it, the way a credit score does. `NAMING.md` is locked and says a term it does not cover goes to
   OPEN QUESTIONS rather than a guess, so this is a canon decision, not a drive-by. **"Standing" is
   used throughout this document as a plain descriptive word, not a proposed proper noun.**

---

## References

[FOCUS-MODEL.md](FOCUS-MODEL.md) · [ADR-811](DECISIONS.md) · [ADR-914](DECISIONS.md) ·
[ADR-1291](DECISIONS.md) · [VALUE-LADDER.md](VALUE-LADDER.md) · [PRICING.md](PRICING.md) ·
[COMMUNITY-COLLECTIVE-STRATEGY.md](COMMUNITY-COLLECTIVE-STRATEGY.md) · [NAMING.md](NAMING.md) ·
[CONTENT-VOICE.md](CONTENT-VOICE.md) · [DISCOVER-LAYER.md](DISCOVER-LAYER.md) · [SPACES.md](SPACES.md)
