# Platform Vision: one community graph, two entities, one game

> **The big picture.** Frequency is **one community graph spanning two legal/financial
> domains, with a geographic growth flywheel running through the middle.** This doc
> captures the whole-system vision the owner articulated, and names the **seams** that
> must exist in the architecture *now* so every vertical (community, Programs, Local
> Marketplace, The Collective, affiliate, donations, Lab Spaces) plugs in later **without a
> rewrite**.
>
> Status: **strategy / decision doc.** It governs a new wave of ADRs (ADR-029→036) and
> reconciles the [ROADMAP](../ROADMAP.md) "Deliberately NOT building" list (see §8).
> Extends, does not replace, [TECH-STRATEGY](TECH-STRATEGY.md),
> [SCALE-ARCHITECTURE](SCALE-ARCHITECTURE.md),
> [CAPABILITIES-AND-MOBILE](CAPABILITIES-AND-MOBILE.md), and
> [ENGAGEMENT-ARCHITECTURE](ENGAGEMENT-ARCHITECTURE.md).
>
> **Authority order is unchanged:** running code + `supabase/migrations/` > repo `docs/`
> > Notion. This is a *target* doc; where it describes things not yet built, the code is
> still the truth until the migration lands.

---

## 0. The one-paragraph model

Every person has **one identity** on **one community graph**: profile, personas
("hats"), relationships, a place in the world (`outpost → nexus → hub → circle` +
PostGIS), and **one shared game** (the engagement/reward ledger). That graph is
**entity-blind**: it does not care about money. Hanging off the graph are **two legal
entities** whose **money is hard-partitioned**:

- **Frequency Foundation (nonprofit, 501c3)**: the worldwide community mission: free
  membership, seed programs (how to start a group, assets, "do good locally"), circles,
  channels, meetups, connection/mental-health/loneliness work. Funded by **donations +
  grants** (and *possibly* nonprofit dues, see §3, an open legal decision).
- **Frequency Labs (for-profit)**: the physical "third spaces" and commerce: **Lab
  subscriptions**, the **practitioner marketplace** (programs, sessions, mindfulness/
  meditation/healing), **affiliate** commissions, and **paid "depth" tiers** of the
  website/game (freemium). Funded by **commerce** (Stripe Connect).

The **flywheel** ties them together: online community forms → people meet in person
(gamified: check in, do your practice, tag a node, invite a stranger) → local density
grows → **density seeds the need for a third space** → a Lab opens → subscriptions fund
more in-person practice → more community → the next town, state, country. The nonprofit
*creates the demand*; the for-profit *serves and captures* it; the demand signal is a
**measurable product surface** (place-tree + PostGIS density heatmap, §6).

---

## 1. The load-bearing law

> **The community graph and the engagement/game ledger are SHARED and ENTITY-BLIND.
> The FINANCIAL ledger is HARD-PARTITIONED by legal entity, and the two money systems
> never commingle.**

Three rails, deliberately separated:

| Rail | Shared or partitioned? | Holds | Source of truth |
|---|---|---|---|
| **Community graph** | shared, entity-blind | identity, personas, place-tree, relationships, content | `profiles` + hierarchy tables |
| **Engagement/game ledger** | shared, entity-blind | zaps, gems, ranks, streaks, achievements | `engagement_events` (ADR-019/025) + reward txns |
| **Financial ledger** | **partitioned by entity** | dollars: donations vs commerce | a **new** `financial_transactions` ledger, `entity`-tagged |

Corollaries (each is an irreversible-if-wrong seam):

- **Points are not money.** Gems/zaps and dollars never share a table. (Already true;
  this elevates it to law.)
- **Points are not entity-bound; every dollar is.** A check-in at a *for-profit* Lab
  earns *shared* community points, that's the glue. But every dollar carries an
  immutable `entity` tag (`foundation` | `labs`) and cannot leak across.
- **Two Stripe relationships, not one with a flag.** A 501c3 commingling funds with a
  for-profit is a compliance problem, not a style preference. Donations/grants flow on a
  nonprofit rail; marketplace/subscriptions/affiliate flow on a for-profit **Stripe
  Connect** rail. Reconciliation and reporting are per-entity.
- **Inter-entity value flows are first-class, audited ledger entries** (e.g. the
  for-profit donates to the Foundation, or the Foundation pays the for-profit under a
  services agreement). The architecture *records* them; the *mechanism* is a legal/
  accounting decision (§3).

See ADR-029 (entity partition), ADR-032 (dual financial ledger).

---

## 2. Identity is three orthogonal axes (never one enum)

The most expensive thing to get wrong, and the thing that makes "different sign-up
tracks" and "many roles as we grow" cheap forever. There are **three independent axes**:

| Axis | What it answers | Model | Status |
|---|---|---|---|
| **Trust/role ladder** | how much can this person be trusted / moderate others | `community_role` enum `member < crew < host < guide < mentor < janitor` | **exists** |
| **Staff/ops role** | business cockpit access | `team_members` (owner/admin/marketer/analyst), `requireStaff()` | **exists** (ADR-027) |
| **Persona / track** | what is this person *here to do* | **multi-select set** of persona records (hats) | **new** (ADR-030) |

**Personas are hats, not ranks, and multi-select.** One human can be a general member
*and* a practitioner *and* an affiliate *and* a business, simultaneously, each
separately verified. A practitioner is **not** "above" a member. Therefore a persona is
**not** an enum on `profiles`; it is a **set** of `profile_personas` rows, each with its
own `state` (claimed → verified → active → suspended) and, where money is involved, its
own **Stripe Connect account binding** and **entity**.

**Reconciliation with the existing `profiles.entity_types text[]`:** that array already
tags *directory kind* (`member/vendor/performer/service`), see DATABASE.md. Personas are
the *richer, behavioral* evolution: they add **verification state** and **money-account
binding** that a plain text tag can't carry. The migration path (ADR-030): keep
`entity_types` as the lightweight directory tag; introduce `profile_personas` for any
persona that gates **capabilities, onboarding tracks, or money**. Do not duplicate.

**Why this makes the menus trivial:** navigation and capabilities are the **union of
(trust-role ⊕ each active persona ⊕ scope)**, computed by the *existing* capability
resolver (ADR-017). Add a persona → its nav entries + capabilities light up; nothing else
changes; the stripped-down mobile app shows the right hats with zero extra logic.
"Practitioner sees My Workshops; host sees Manage; janitor sees everything" falls out for
free. **Verification is per-persona, not per-user**: "verified practitioner" ≠ "verified
business" ≠ "verified affiliate"; some capabilities (especially *receive money*) gate on
the persona's verified state.

---

## 3. Membership = one freemium tier ladder (generalizes `crew`)

The free/paid split is **one ladder of tiers on one profile**, read by the same resolver
that gates everything else. It is **not** a new system, it **generalizes the existing
`crew` tier** (GLOSSARY: "the paid membership tier, intended $10/mo, currently free during
beta").

- **Free (Foundation):** anyone worldwide. Full community membership, local circles/
  channels, seed programs, meetup engine, basic game. The **mission**, nonprofit-funded.
- **Paid (depth):** freemium upgrade unlocking more website/game depth + premium surfaces;
  plus **Lab subscriptions** where physical spaces exist. **Commerce**, for-profit.

A paid member's "extra depth" = more capabilities + more modules light up. The tier is
just another **input to the resolver**.

> **⚠️ The one careful line (open legal decision).** A paid membership whose free version
> is a *nonprofit program* and whose paid version is *for-profit revenue* crosses an
> entity boundary. **Which entity sells the paid tier, and what is being bought?** Two
> clean structures: (a) the **for-profit** sells "premium features / deeper game" (clean
> commerce); or (b) the **Foundation** offers a genuine nonprofit *membership* (dues, the
> way museums do), with mission-aligned benefits. These are **not** the same and an
> accountant/attorney picks. The **architecture must support either**: the **tier object
> carries `entity` + `revenue_type`** (`donation` | `dues` | `commerce`) so one smooth
> "upgrade for more depth" UX routes to the correct legal home and Stripe relationship
> without a rebuild. See ADR-031.

**Subscription-as-bridge (the delicate join).** A Lab membership is a *for-profit
subscription* (money) that grants *community benefits* (access to spaces where practice
happens → earns shared points). Model it as: **for-profit subscription state → grants a
shared-graph *entitlement* → which the engagement engine reads.** The subscription lives
in the money domain; the entitlement + the engagement it unlocks live in the shared graph.
See ADR-035.

---

## 4. Every vertical is a module against a registry

To "grow into whatever it becomes," each vertical is a **self-contained, vertical-slice
module** (per SCALE-ARCHITECTURE §3 and ENGAGEMENT-ARCHITECTURE §4) that **declares
itself** to a registry rather than editing the core. A module declares:

1. **Data**: own tables, namespaced (`market_*`, `collective_*`, `program_*`,
   `affiliate_*`, `donation_*`). Touches core tables only by FK.
2. **RPCs**: `SECURITY DEFINER` functions returning **contract view-models + capability
   sets** (the `/discover` pattern, ADR-018, generalized). **Both web and the app call
   the identical RPC**: this is *why* the app can be "just as fully featured": same data,
   only the rendering differs.
3. **Capabilities**: granular actions (`market.listItem`, `collective.host`,
   `program.publish`, `affiliate.refer`, `donation.give`) fed into the **same** resolver
   (ADR-017).
4. **Navigation + composition**: which personas/roles/tiers/scopes surface it, where.
5. **Engagement hooks**: which actions emit `engagement_events` (ADR-019/025) so
   gamification, CRM, and analytics get them for free.
6. **Entity domain**: `foundation` | `labs` | `shared` (drives which money rail, if any).

Once the registry seam exists, **"add the trades marketplace" = ship a `market`
module**; core does not change. See ADR-033.

**Vertical catalogue (target, built later, seamed now).** The full 13-vertical list +
build order lives in [DEVELOPMENT-MAP.md](DEVELOPMENT-MAP.md); the money/commerce ones:

| Vertical | Entity | Notes |
|---|---|---|
| Circles / channels / events / nodes | shared | the existing graph + engagement |
| **Programs** | foundation | **free**: frameworks/trainings to start/run/maintain a circle; lifecycle gamification (start→activate→invite→attend). The mission's activation engine. |
| **Local Marketplace** | foundation, **no fee** | geolocated goods swap/sell/offer; anti-consumerism, local mutual support; **scoped to locality** via the place-tree + PostGIS. Likely **no in-app payment** (arrange offline) → lighter trust & safety than a paid marketplace. |
| **The Collective** | labs | members apply to contribute and host **paid** meditations/courses (Insight-Timer model); Connect payouts; **digital-vs-physical fulfillment flag** (§7) |
| Affiliate program | labs | referral attribution → commission → payout ledger |
| Donations / grants | foundation | nonprofit rail; recurring (if dues, §3) |
| **Lab Spaces** | labs | gym-style SaaS for a worldwide facility network: packages, subscriptions, booking, marketing. **Lab membership** lives here and **rolls in** the website paid tier (ADR-035). |

---

## 5. Trust & safety is content-type-agnostic (and store-mandatory)

The Local Marketplace + The Collective mean **strangers connecting and transacting**, which
raises the safety bar beyond today's moderation queue + janitor. Required seams **now**:

- **Content-type-agnostic moderation.** Reporting a *listing*, a *Collective offering*, a
  *profile*, a *message* must use **one pipeline**. The existing `reports.target_type` enum
  (`post/dispatch/comment/member/event`) generalizes to cover the new content types, do
  not fork a second moderation system.
- **Blocking is first-class, now, not v2.** ADR-015 says "no blocking in v1" (fine for
  friends-only DM). **Superseded for the platform vision:** a `blocked` relationship is
  required, because (a) a marketplace needs it for safety, and (b) **Apple/Google require
  per-user block + per-content report for any UGC app.** See ADR-036.
- **Ratings / reviews / disputes** for The Collective's paid offerings (a payout that's been
  disputed is a real ledger state, ties to §1).

---

## 6. The flywheel as a measurable surface (not just narrative)

"Seed the need for the next third space" is a **product feature**, not a slogan:

- **Density / demand read-model** off the place-tree + PostGIS: *where is local community
  density crossing the threshold that justifies a Lab?* This is the **expansion
  decision-engine**: and doubles as a story for **grant funders** (nonprofit impact) and
  the **for-profit expansion plan**.
- The **"invite a stranger / tag a node / check in"** loop is already the engagement
  source-adapter model (ENGAGEMENT-ARCHITECTURE §1); outreach + in-person earn **zaps**
  (ADR-021), the architecture already privileges the exact "spread community outward"
  behavior the flywheel needs.

---

## 7. Mobile + App Store seams (design in, don't retrofit)

The app is the **primary doorway** (TECH-STRATEGY) and consumes the **same RPC contract +
capabilities + tokens** as web, so it is "assembly, not invention", *provided* these
store landmines are seamed up front (ADR-036):

- **Account deletion in-app**: Apple *requires* a user-initiated delete flow. You have
  soft-deactivation (`profiles.is_active`, `suspended_*`); a real self-serve delete path
  must exist.
- **Per-user block + per-content report**: see §5; table stakes for store approval.
- **Digital-vs-physical fulfillment flag on every sellable item.** Apple/Google take ~30%
  on *digital* goods sold in-app (a downloadable meditation program) but **not** on
  real-world goods/services (a local trade, an in-person workshop). This distinction
  **determines whether an item can be sold in the app at all** or must be web-only, so it
  is a **field on the item from day one**, not a later patch.
- **Engagement ladders up to verified practice** across every vertical (next section), 
  this is also what keeps the gamified app from reading as a manipulative "dark pattern"
  engagement machine at review time.

---

## 8. The North-Star guardrail (reconciles the ROADMAP exclusions)

The ROADMAP's "Deliberately NOT building" list excluded **Marketplace, Affiliate, custom
roles, branded mobile app** as "creator-tool scope creep" that conflicts with the
worldview. **This vision brings them into scope, but preserves the worldview via a hard
guardrail** (owner decision: *"ladder up to practice"*):

> Every vertical's **high-value** rewards stay tied to **real-world outcomes**. A
> marketplace sale that leads to a real local meetup, a workshop someone *attended*, a
> program someone *completed* → ladders toward `practice.verified` and earns **zaps**.
> Browsing, scrolling, racking up referrals → earn the lesser on-platform currency
> (**gems**, ADR-021) and **never** inflate the practice metric. **"What counts as
> practice" is centrally governed (ADR-024), not self-declared per module.**

So the verticals **reinforce** the North Star (WAM via verified practice) instead of
diluting it into engagement-for-its-own-sake. The ROADMAP exclusion list is updated to
point here (these are now *in scope, guardrailed*), **except** the worldview-defining
piece that stays: the **trust/role ladder remains the 6 tiers**: "many roles as we grow"
is expressed on the **persona axis (§2), not by inflating the role ladder**. See ADR-034.

---

## 9. What's genuinely new vs. already seamed

| Concern | Status | Where |
|---|---|---|
| Community graph, place-tree, PostGIS | **exists** | hierarchy tables, ADR-006/020 |
| Engagement/reward ledger (entity-blind) | **exists** | `engagement_events`, ADR-019/025 |
| Capability resolver + contract layer (shared by web+app) | **exists** | ADR-017/018 |
| Paid tier (`crew`) | **exists**, to be generalized | GLOSSARY; ADR-031 |
| `entity_types` directory tags | **exists**, to be reconciled with personas | DATABASE.md; ADR-030 |
| **Persona axis (multi-select hats + verification + money binding)** | **new** | ADR-030 |
| **Entity-partitioned dual financial ledger + two Stripe rails** | **new** | ADR-029, ADR-032 |
| **Tier object carrying `entity` + `revenue_type`** | **new** | ADR-031 |
| **Module registry (entity-tagged verticals)** | **partially** (engagement modules exist) | ADR-033 |
| **Subscription-as-bridge entitlement** | **new** | ADR-035 |
| **Content-agnostic moderation + first-class blocking + store seams** | **new / supersedes ADR-015** | ADR-036 |
| **Density/demand expansion read-model** | **new** | §6 (no ADR yet, analytics, build when measured) |

**The only structurally new backend is the entity-partitioned financial layer + the
persona axis.** Everything else is modules and tiers on the graph you already have.

---

## 10. Open decisions (you + advisors: architecture supports either)

Captured so they are **not lost** and **not guessed**:

1. **Which entity sells the paid membership tier** (the UBI/charitable-purpose line, §3).
2. **Does the Foundation take membership dues at all, or only donations/grants** (changes
   whether the donation rail needs a recurring-dues mode).
3. **How value flows between entities**: for-profit→Foundation donation, or
   Foundation→for-profit services agreement (the "back-and-forth, handled carefully").
   Architecture records inter-entity transfers as audited ledger entries regardless.
4. **First proving vertical = The Collective** (decided): contributor-hosted paid
   meditations/courses exercises the most seams at once (persona + verification + Connect
   payout + digital-vs-physical + practice-laddering) and is closest to the meditation/
   Insight-Timer soul of the product. The free verticals (Programs, Local Marketplace) ship
   *earlier*, in the beta era, since they need no money foundation. Full order:
   [DEVELOPMENT-MAP.md](DEVELOPMENT-MAP.md).
5. **Reward economy values, physical-node rollout/safety, web's role once mobile leads**
 , product decisions already flagged in TECH-STRATEGY; unchanged.
