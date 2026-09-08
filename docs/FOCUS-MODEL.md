# The focus model: what Frequency is for, and where the game sits

> **Status: PROPOSAL, awaiting an owner ruling.** Nothing here is decided.
> Status for any work it produces lives in [`BUILD-BACKLOG.json`](BUILD-BACKLOG.json), never in this
> file. Filed 2026-09-08 from an eight-lane repo sweep plus live production reads.
> Decision record, once ruled: [ADR-1291](DECISIONS.md).
>
> **This document explains a reframe. It does not track whether the reframe is done.**

---

## The answer up front

The repositioning the owner is describing **is already the ruled strategy**. [ADR-811](DECISIONS.md)
locked "Frequency is a Community Collective" on 2026-07-23, the marketing site already leads with it,
and `SITE_DESCRIPTION` already says it. What never followed is the **inside of the app**, which still
opens on a personal game.

So this is not a strategy change. It is closing a gap between a decided strategy and an undecided
interior, and the work is smaller and more surgical than it looks.

Three things are true, all measured, none of them obvious:

| # | Finding | Evidence |
|---|---|---|
| 1 | **The marketing says Collective; the app says Quest.** 0 of 13 home blocks mention the game. Inside, the game holds 5 of 16 rail rows, 1 of 5 mobile tabs, the raised centre button, the entire feed hero, and a permanent Vault dock. | `lib/page-editor/templates/home.ts:63`, `lib/nav-areas.ts:120-134`, `components/layout/app-shell.tsx:1572-1610`, `app/(main)/feed/page.tsx:245-270` |
| 2 | **The revenue model the owner wants is ~85% built and dark.** Paid tiers → Stripe Connect subscription → webhook → automatic circle membership all exist. It cannot complete because the Stripe webhook was never registered, and it is walled behind a $29/mo plan the operator must buy first. | `lib/billing/space-membership-checkout.ts`, `lib/spaces/tier-circle.ts`, `OWN-050` (P0), `lib/pricing/gates.ts:144` |
| 3 | **"Communities run their own program" is an accepted ADR that was never sequenced.** [ADR-252](DECISIONS.md) already ruled Journeys are group-coaching programs a Circle moves through together. The engine exists: `journey_runs` + cohort meter + drip + kickoff event. | `supabase/migrations/20260621000000_journeys_v2.sql`, `lib/journeys/cohort.ts`, `components/journey/v2/cohort-meter.tsx` |

**The one thing that is genuinely new** in the owner's framing, and the one that should be ruled
deliberately: **individuals never pay, and the platform's cut moves onto money that flows between a
community and its own members.** That is a real change, it contradicts a live gate, and it has a
23-day fuse (see §6).

---

## 1. What the product actually is today, measured

Read from production on 2026-09-08, not inferred.

| | Count | What it means |
|---|---|---|
| Profiles | 58 | Pre-launch. Founder, friends, early operators. |
| Spaces | 22 (21 real + the root) | The real object people have created. |
| **Spaces with zero Circles** | **20 of 21** | The community layer has not formed inside spaces. |
| Circles | 7, of which **6 belong to the root Frequency space** | "Frequency the community" is still the only community. |
| Events | 67, of which **36 belong to the root space** | Same shape. |
| Paying memberships | 2, both `payment_status = 'pending'` | Nothing has ever been charged. |
| Practice logs | 226 | The game works; a handful of people play it. |
| `engagement_events` | 56,395 | The ledger is real and load-bearing. |

**The honest read: Frequency today is the founder's community plus twenty-one business profile
pages.** The collective thesis is unvalidated rather than failing, and the single number that would
prove it is **circles per space**, currently 0.05.

That number is also the cleanest argument for the reframe. A member who lands in the app is handed a
personal practice game. A business that signs up gets a profile page. Neither one is handed the thing
the strategy says we sell: *your community, running inside ours*.

---

## 2. Where the attention actually goes

The gap between the two halves of the product, stated as inventory.

**Front door (already on-message).** Home H1: *"Frequency is a Community Collective for the people who
gather everyone else."* Thirteen blocks: none about the Quest. `/the-quest` is one of six header tabs.

**Inside (still game-first).**

| Surface | Game share | Cite |
|---|---|---|
| Left rail | "The Quest" section = **5 of 16** member-visible rows | `lib/nav-areas.ts:120-134` |
| Mobile spine | **1 of 5** tabs, plus the raised centre button labelled **Zap** | `lib/nav/registry.ts:621-657`; `app-shell.tsx:1572-1610` |
| Feed hero | `JourneyBoard` / `PracticePrompt`, props are **entirely game state**; plus two celebration modules | `app/(main)/feed/page.tsx:228-270` |
| Right rail | "Your Quest" next-step panel + Frequency Signature dial + a permanent Vault dock | `right-sidebar.tsx:289-361`, `app/(main)/layout.tsx:561` |
| Layout catalog | **46 of 144** assignable modules are game-owned | `lib/widgets/modules.ts` |
| Weekly digest email | Leads with streak, season rank, zaps | `lib/digest.ts:154-213` |

Meanwhile, on the logged-in home, **circles and spaces have zero dedicated modules.** Circles appear
only as a conditional nudge and a right-rail panel.

**The onboarding already disagrees with the feed.** The induction tour shows three rooms: Feed,
Circles, Events, no Quest. Vera's welcome deck calls Circles *"the heart of it"* and her one CTA is
*"Want me to point you at a circle?"* Then the member lands on `/feed` and is met by a practice board.

That is the whole problem in one sentence: **we already tell the right story right up to the moment
someone walks in.**

---

## 3. What a demotion would and would not break

This is the section that decides whether the reframe is cheap or expensive. It is cheap, but only if
it is a **presentation** change, not a deletion.

**The scale of the entanglement is real.** ~19,000 LOC of game-owned `lib/`, ~17,000 of components,
~35 game-only tables, and **206 award call sites across 51 files**, most of them inside *non-game*
features: event RSVP and check-in, circle claim, onboarding, referrals, QR capture, walkthroughs.

**Four things must never be removed:**

1. **`engagement_events`** (56k rows) is the game's ledger *and* the CRM, funnels, trust, analytics
   and member-traits source. 37 non-test consumers.
2. **`profiles`' 11 game columns** are read by the digest, the profile page, circle member lists and
   the admin member manager.
3. **`practices` / `journey_plans`** are the `/discover/*` SEO corpus and emit HowTo JSON-LD.
4. 🔴 **Event attendance has no independent record.** There is no `checked_in` column. Attendance
   exists *only* as an idempotent engagement-ledger row written by the same code path that pays Zaps
   (`app/(main)/events/actions.ts:1597-1685`). **Decoupling attendance from the reward is a
   prerequisite for any game change**, and it is the single most load-bearing coupling in the repo.

**The good news is architectural.** [`ENGAGEMENT-ARCHITECTURE.md`](ENGAGEMENT-ARCHITECTURE.md) already
separates the pipeline into **SOURCE → VERIFY → LEDGER → REWARD**. Turning the game down means
turning the *fourth* stage quiet. The first three keep running, the CRM keeps working, and nothing
gets deleted. That seam is why this is a weeks-scale program and not a re-platform.

**Precedent exists, twice.** Rewards Economy v3 already cut a large slate wholesale (Co-op Pulse,
Synchrony, Carrier Wave, Circle Current, Practice Shelf, Side Quests, the recruiter leaderboard) in
`20260702000001_rewards_v3_teardown.sql`. And `docs/QUEST-UI-REDESIGN.md` already recommends *fewer,
calmer* mechanics and explicitly asks to "demote rail dupes" — a consolidation that was never done.
`docs/QUEST-IA-DEBT.md` (ADR-293, still open) says it plainest: *"a member can't tell which surface is
the front door."*

---

## 4. The collective layer already exists, and it is already the design law

The owner's phrase, "we're all on a quest together", is not a new mechanic. It is the mechanic the
code already argues for and does not lead with.

- **`components/quest/collective-goal.tsx`** is a shared milestone bar that cites Festinger 1954 and
  JMIR 2021 **to justify leading with the shared bar and demoting the individual ladder.** It already
  headlines two pages.
- **`getCollective(scope = 'global')`** already computes a network-wide total across every active
  profile. It is reachable only by a query parameter on the leaderboard.
- **`season_challenges` are global by design**, and **`circle_challenge_adoptions`** already lets a
  Circle opt into one collectively. Table built, adopt action built, module rendered, **0 rows**.
- **`/events/calendar`** is the master network calendar, every public event across the network, with a
  public `.ics` feed. It is the strongest existing "one network" surface and it is not on the rail.

So the collective story needs **surfacing and defaulting, not building**.

One warning: the *inter-circle* layer (Circle Current, Co-op Pulse, Synchrony, Carrier Wave,
`circle_awards`) was built and then **deliberately torn down**. Reviving any of it is a fresh decision
against a recorded one, not the un-parking of dormant code.

---

## 5. What a community can and cannot run for its own people

The substance under the game is genuinely strong, and the gap is precise.

**Built and real:** a Phase → Module → Lesson curriculum engine (`journey_plan_items.block_type`),
cohort **Runs** owned by a Circle (`journey_runs`: `circle_id`, `host_id`, drip interval, enrol cap,
kickoff event), per-lesson progress, certificates, weekly auto-drip email, a cohort meter, recurring
and ticketed events with approval and waitlists, a full CRM, campaign email, automation, a shop, and
**34 operator modules** in the Space console.

The right way to say it: **a Circle is the cohort, a Journey is the course, a Run is the offering.**
That is exactly the primitive the owner is asking for, and it is already the ruling in ADR-252.

**The five gaps that stop a Skool or Mighty Networks operator from moving in:**

| Gap | Evidence |
|---|---|
| **You cannot sell a course.** `journey_plans` has no price, no Stripe product, no tier link. | `lib/database.types.ts:6425` |
| **No gated content except events.** Only `event_ticket_types` carries `member_only` / `space_tier_id`. Journeys are `private \| unlisted \| public`, with no fourth "members of my tier" state. | `lib/database.types.ts:4676-4685` |
| **No space-level discussion.** `posts` has `scope_circle_id`, `scope_event_id`, `scope_profile_id` and **no `scope_space_id`**. A Space's only broadcast is an announcement wall with no replies. | `20260829000000_h1_1_scope_typed_arc_expand.sql:49-51` |
| **No member directory.** `space.people` is the *staff* roster. Paying members live in `space_memberships` with no browsable roster. Members of a community cannot find each other inside it. | `lib/admin/modules/space-modules.ts:157` |
| **Enrollment takes no money**, and Space analytics is QR-scan-shaped, with no completion, retention or revenue readout. | `settings/enroll/section.tsx:17` |

**Practice authoring is Crew-gated** (`app/(main)/practices/create-actions.ts:43-54`), which under a
"free for individuals" ruling should go.

---

## 6. The money, and the contradiction at the centre of it

### What is already built

The owner's proposed primary revenue model exists end to end and is dark:

`space_membership_tiers` (name, `price_cents`, `interval`, `benefits`, `capacity`, `waitlist`,
`stripe_product_id`, **`circle_id`**) → member checkout as a **Stripe Connect destination charge**,
application fee = the Space plan's take-rate → webhook reconciles `space_memberships`
(`stripe_subscription_id`, `payment_status`) → **`syncTierCircleAccess`** writes a real `memberships`
row into the linked Circle, stamped `granted_by_tier_id` so it can be revoked without ever touching a
membership the member chose themselves.

Access control is already there twice over: `circles.access` accepts `space_paid_members` and `tier`,
enforced by an RLS restrictive policy *and* a pure app-layer predicate.

Flags read live: `billing_live = true` (since 2026-07-21), `host_payouts_enabled = true` (since
2026-09-04).

### The four things stopping it

1. 🔴 **`OWN-050`, the backlog's only P0: the Stripe webhook endpoint was never registered.**
   `stripe_webhook_events` has held 0 rows for the life of the table. **No payment on any path has
   ever been recorded.** This is a Stripe dashboard task, not code, and it blocks every revenue idea
   in this document.
2. **There is no member-facing "my memberships" surface.** No route exists. A member who starts paying
   a community has nowhere to see or manage it.
3. **`payment_status` is never enforced.** Both the RLS helper and the app predicate read `status`
   only, and nothing flips it, so a `past_due` member keeps circle access forever. Dunning covers the
   platform's own Crew subscription and not Space memberships.
4. **The wall is in the wrong place.** See below.

### The contradiction

`lib/pricing/gates.ts:144` sets `space_memberships: { minEntitlement: 'business' }`, and free Spaces
get **0** membership tiers. **An operator must buy a $29/mo subscription before they may collect a
single dollar from their own members.**

That is the exact inverse of the rule this repo already adopted. [ADR-914](DECISIONS.md) says: *"Never
gate the transaction. Gate the repeat."* It says a free Member can sell tickets and take donations on
day one, precisely because *"a free Member who hits a paywall does not upgrade, they send people to
Venmo, and both the sale and the contact are lost permanently."* Recurring dues are the one place that
rule was not applied, and it is the place the owner now wants to be the primary engine.

The gate's own comment defends itself well, and the argument deserves an answer rather than a
dismissal: a monthly membership *"is a promise to another person"*, and helping someone make that
promise from an account they may abandon next month is not a feature. **That is a readiness concern
wearing a pricing gate's clothes.** Test readiness directly, and the wall stops taxing the thing we
want to grow.

---

## 7. The proposal

Three moves. Each uses primitives that already exist, and none of them invents a proper noun
(per [`NAMING.md`](NAMING.md), a new term goes to OPEN QUESTIONS, never a guess).

### Move 1 — The Quest becomes the Collective's own program, not the app's spine

Keep the name. Keep the game. **Change what leads.**

- **Collapse the rail.** "The Quest" goes from a 5-row section to **one row** pointing at `/crew`,
  which becomes the single door. This is `QUEST-UI-REDESIGN`'s own unbuilt recommendation and it
  closes `QUEST-IA-DEBT` (ADR-293).
- **Give the centre button back to the community.** The raised mobile button currently fires the
  game's capture. It should create the thing the strategy sells: a post, an event, a gathering.
- **Re-lead the feed.** The hero becomes a **community board** — your circles' next gathering, your
  spaces' activity, who is going. `JourneyBoard` moves to a rail panel. This is where the 0.05
  circles-per-space number gets attacked.
- **Lead the game with the shared bar.** Make `getCollective('global')` the *default* scope, not a
  query parameter, and let the individual ladder sit underneath it. The code already argues for this
  in its own comments.
- **Quiet the REWARD stage, keep SOURCE → VERIFY → LEDGER.** Celebrations, toasts and the Vault dock
  become opt-in rather than ambient. **Nothing is deleted and the CRM never notices.**
- **Prerequisite, non-negotiable:** give event attendance its own record before touching any of this.

### Move 2 — Every community runs its own program; the Quest is one template among them

This is ADR-252, finally sequenced, and it is the answer to "their own program or the general
template".

- A Circle **Run** of a Journey is already the cohort program. Surface it as the headline operator
  verb: *start a Run*.
- A Space can **adopt** the official Quest Journeys as a template, **remix** them, or **author** its
  own. All three verbs already exist (`fork_of`, `adopt_count`, `circle_templates`, `program_only`).
- `circle_challenge_adoptions` becomes the "we're doing the collective thing together" opt-in: the
  Circle joins the seasonal challenge as a group, or runs its own instead. **Built, rendered, zero
  rows.** It needs seeding and a door, not a build.
- The five gaps in §5 become the operator roadmap, in this order: **sell a course · gate content to a
  tier · a member directory · space-level discussion · completion analytics.**

### Move 3 — Free to be here, pay to belong to a community

- **Individuals never pay.** Retire the five member-facing feature gates and the four parallel
  `isPaid` walls (`entry_points`, `codes`, paid-only DM rooms, `vault_cash_in`), and un-gate practice
  authoring. Two of the five are already decorative, so the real work is small. **Keep Crew** as
  contribute-what-you-want patronage with **no feature difference** — it already carries the honest
  name (`NAMING.md`: "contribute what you want, never pay what you want").
- **Move the membership wall off the plan and onto readiness.** Any Space may sell memberships from
  day one, subject to a payout-ready Connect account, a published circle to deliver into, and a stated
  cancellation policy. That answers the gate comment's real concern and stops taxing the engine.
- **The subscription becomes a buy-down, not a permission.** The take-rate ladder already exists and
  already does exactly this: free Space **10%** → Business **5%** → Collective **3%** → Non Profit
  **0%**, and **0% on your own audience, forever**. A Business plan then sells on *tools* — CRM,
  campaign email, automation, the multi-page site — which is what it is actually worth.

**Revenue then has two legs that reinforce instead of blocking each other:** a percentage of dues
flowing to communities, and subscriptions bought by the operators whose dues volume makes the tools
worth paying for.

### 🔴 The honest counter-argument

**Dues revenue cannot pay a bill in 2026.** Ten percent of a $10/month circle is one dollar per member
per month. With 7 circles and 0 paying members, the near-term number is zero on either model. The
Business subscription is the only line that can carry cost this year.

So the recommendation is **not** "replace subscriptions with dues". It is: *remove the membership wall
from the subscription and re-justify the subscription on tools.* Long-run the dues take-rate compounds
with the network; short-run the subscription pays. Removing the wall costs nothing today, because
today it is collecting nothing.

---

## 8. The 23-day fuse

`beta_grace` is set to **2026-10-01** (`platform_flags`, read 2026-09-08). On that date
`featureGatesLive()` flips true and the paid ladder starts biting for the first time: the Crew gates on
individuals, the plan gates on Spaces.

**Whatever is ruled, it must be ruled before 1 October, or the window extended.** Letting the gates
close on individuals by default, three weeks after deciding they should be free, is the avoidable
version of this mistake.

---

## 9. Sequencing — this plugs into existing waves, it does not start a sixth list

There is one backlog. Nothing here becomes a parallel roadmap.

| Order | Work | Where it goes | Depends on |
|---|---|---|---|
| **0** | Register the Stripe webhook | `OWN-050`, already P0 and already filed | owner, dashboard |
| **0** | Rule the focus model (§7) and the grace window (§8) | new owner row, `ownerAction: ruling` | owner, before 1 Oct |
| **1** | Give event attendance its own record, independent of the reward ledger | W0b, prerequisite for everything in Move 1 | — |
| **2** | Rail collapse, centre button, feed hero, shared-bar default | W0b/W2, closes `QUEST-IA-DEBT` (ADR-293) | step 1 |
| **3** | Membership wall → readiness; member "my memberships" surface; enforce `payment_status` | W8 money lane, pulled forward | step 0 |
| **4** | Runs as the operator headline; seed `circle_challenge_adoptions` | W7 feature depth | ruling |
| **5** | The five operator gaps (§5), in the stated order | W7/W8 | ruling |

**Untouched:** the Editor program E0–E9 (W4) and the four parked programs (App Platform, White label,
Etsy-grade store, Mobile). Nothing in this proposal competes with them.

**Rows that must be reconciled with any ruling:** `OWN-050` (P0, webhook), `OWN-046` (do member sales
settle in-app), `OWN-048` (capability bundles and the 22-key function registry — the definition of what
a Space *is*), `OWN-063` (does a recurring series cost one event allowance or one per date),
`LIVE-204` (front-door wording), `HYG-033` (the mobile tab bar this proposal changes).

---

## 10. What the owner has to decide

Six rulings. Everything else follows from them.

| # | Ruling | Default if unanswered |
|---|---|---|
| 1 | Does the Quest stop being a top-level section and become the Collective's own program? | It stays the spine, by inertia |
| 2 | Do individuals pay for anything, ever? | The gates close on 1 October |
| 3 | May a **free** Space sell memberships, gated on readiness instead of plan? | No, and the dues engine stays walled |
| 4 | Is a Circle Run of a Journey the headline way a community runs its program? | ADR-252 stays unsequenced |
| 5 | Do we build the five operator gaps (sell a course, gate to a tier, member directory, space discussion, analytics)? | Operators keep hitting them |
| 6 | Extend `beta_grace` past 1 October while this is decided? | It expires |

---

## 11. One more thing, unrelated but worth fixing in the same pass

The repo currently ships **at least six materially different answers** to "what is Frequency", across
22 distinct positioning lines: *a Community Collective* · *community infrastructure for real-world
connection* · *rebuilding the third place* · *the standing room under event tools* · *a creator and
business growth network* · and the help centre's *turn what you care about into real-world community*.

A repositioning is the cheapest moment to collapse those to one. `lib/site.ts` is already the single
source for the tagline; nothing equivalent exists for the sentence underneath it.

---

## References

[ADR-811](DECISIONS.md) · [ADR-914](DECISIONS.md) · [ADR-252](DECISIONS.md) · [ADR-293](DECISIONS.md) ·
[COMMUNITY-COLLECTIVE-STRATEGY.md](COMMUNITY-COLLECTIVE-STRATEGY.md) · [VALUE-LADDER.md](VALUE-LADDER.md) ·
[PRICING.md](PRICING.md) · [ENGAGEMENT-ARCHITECTURE.md](ENGAGEMENT-ARCHITECTURE.md) ·
[QUEST-IA-DEBT.md](QUEST-IA-DEBT.md) · [QUEST-UI-REDESIGN.md](QUEST-UI-REDESIGN.md) ·
[REWARDS-ECONOMY.md](REWARDS-ECONOMY.md) · [NAMING.md](NAMING.md) · [CONTENT-VOICE.md](CONTENT-VOICE.md) ·
[SPACES.md](SPACES.md) · [STARTER-CIRCLES.md](STARTER-CIRCLES.md)
