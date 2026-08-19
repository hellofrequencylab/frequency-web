# Collaboration + the upgrade funnel (who can collab on what, and every upgrade path)

> **The answer, first.** Collaboration is a **space-to-space** capability, gated to **paid Business /
> Non Profit** spaces on the **host** side; a member tastes the value for free and upgrades to *do* the
> advanced thing. This doc is the single map of **who can collaborate on what** and **every upgrade
> path**. Decision: [ADR-810](DECISIONS.md). Machinery: [SPACE-COLLABORATION-AND-SEATS.md](SPACE-COLLABORATION-AND-SEATS.md)
> (ADR-799), [PRICING.md](PRICING.md), [ROLES.md](ROLES.md). ~~**Everything ships behind `billing_live`
> OFF**, so nothing below changes for a live account until an operator flips go-live.~~ (Struck
> 2026-08-19: the flip has happened — see the ⚠️ note below.)
>
> 🔴 **TWO THINGS IN THIS DOC WERE OUT OF DATE, AND BOTH WERE ABOUT MONEY.** Read
> [PRICING.md](PRICING.md)'s ADR-914 banner as the authority; this file is the map of collaboration,
> not of rates. Both were **corrected in place 2026-08-19** (OWN-032), reversed claims struck through
> where they stood:
>
> 1. **The sell-wall is gone.** §4's capability matrix showed `RSVPs only` for the free tiers.
>    [ADR-914](DECISIONS.md) reversed that: *"A free Member **can** sell. Tickets, donations, payouts,
>    on day one, with no upgrade."* The rule now is **"never gate the transaction, gate the repeat"**,
>    and the free rows of the matrix now say so.
> 2. **The ladder has seven rungs, not four.** §3 quoted "Crew 8% · Business and Collective 5% · Non
>    Profit 0%". It is free Member **10%** · Crew **8%** · free Space **10%** · Business **5%** ·
>    Collective **3%** · Non Profit **0%** · Independent **0%** (verified against
>    `NETWORK_TAKE_RATE_DEFAULT`, `lib/billing/pricing-keys.ts`). Collective is 3%, not 5%.
>
> ⚠️ **`billing_live` is ON in production** (measured 2026-08-19): the go-live flip has happened, which
> is why the sentence at the top of this banner and §5's "today" claims are struck.

## 1. The model in one screen

Three independent axes decide what someone can do (unchanged, [PRICING.md](PRICING.md) §3):

| Axis | Values | Bought / earned |
|---|---|---|
| **Personal tier** (`profiles.membership_tier`) | Visitor · Member (free) · **Crew** (contribute what you want, floor $4.99/mo) | self-serve billing |
| **Community role** (`profiles.community_role`) | Member · Host · Guide · Mentor | **earned, never paid** (ADR-207) |
| **Space plan** (`spaces.plan`) | Free · **Business** ($29) · **Collective** ($79) · **Non Profit** ($39) | self-serve billing |

**Best-practice principle (owner, ADR-552 + ADR-810): let them taste, gate the doing.** A member can
create and use the core surfaces for free; the paid wall sits at **depth, scale, seats, and
cross-business collaboration**. Collaboration is a depth/scale capability, so it gates on the Business
plan on the host side while staying a free preview everywhere.

## 2. Who can collaborate on what

**Only Spaces collaborate. Personal accounts never do** — both relationships are space↔space /
event↔space by construction (there is no profile↔profile "collaboration"). Co-hosts on an event
(`event_cohosts`) are a *different*, person-level feature and are unchanged.

| Relationship | Who initiates | Who confirms | Host-side requirement | Guest-side requirement | Table |
|---|---|---|---|---|---|
| **Host a collaborator space** (a business operates inside your space) | either side | the other side's owner/admin | host space on **Business / Non Profit** ✅ | active space (pays for their own) | `space_collaborations` |
| **Bring a collaborator space onto an event** | event host **or** a space | the other side | event's home space on **Business / Non Profit** ✅ | active space | `event_space_shares` |
| **Feature another space's event on your calendar** | the featuring space | the event host | featuring space on **Business / Non Profit** ✅ | published public/unlisted event | `event_space_shares` |
| **Shared venue holds** (book time at a host venue) | either accepted collaborator | the other side | an **accepted collaboration** already exists | ditto | `space_venue_holds` |

**Confirmation is always required** — every relationship is a request → the other side approves
(either party may initiate; the non-initiating owner/admin approves; either side may revoke). A single
operator who owns both sides auto-accepts. The gate is enforced **server-side in the actions** (the
tables are service-role-only, so the action IS the authority), and a free host sees a **locked
preview** with a *Go Business* prompt rather than a hidden feature.

## 3. Every upgrade path

Each row is one funnel point: a member plays with the value, hits a single clear trigger, upgrades.

| # | From | To | Trigger (the moment) | What it unlocks |
|---|---|---|---|---|
| 1 | Member (free) | **Crew** (contribute what you want) | wants the full game / to stand up their **first Space** | Vault cash-in, full gamification, unlimited Vera, **create 1 Space** |
| 2 | Free Space | **Business** ($29) | wants to **host collaborators**, run a real team, or run **more than one Space** | collaborators, event co-hosting, seats, full CRM/email/automation, custom domain, unlimited Spaces |
| 3 | Free Space | **Non Profit** ($39) | a verified 501(c)(3) wants the full depth at the mission price | everything in Business + donation framing, flat price |
| 4 | Any paid Space | **+ Vera AI** (+$20/mo, $200/yr) | CRM crosses enough contacts to want live matching | the AI matching + next-best-action depth (the Resonance Engine machinery under the hood; the product is called Vera AI, ADR-590) |
| 5 | Business | **more operator seats** (+per seat) | invites a 2nd operator to help run the back office | extra editor/moderator/admin seats (ADR-799 §A) |

~~**Selling IS a wall; being paid attention is not** (ADR-913, revising ADR-552's "money exchange is never
the wall").~~ **Selling is NOT a wall** (corrected 2026-08-19: [ADR-914](DECISIONS.md) reversed ADR-913's
seller gate the day it was written — **never gate the transaction, gate the repeat**). The free tier can
create events, take **RSVPs**, receive **tips** (tips are 0% on every tier, forever), and **sell**:
tickets, donations, payouts, day one, no upgrade. What you pay for is a lower **rate** plus **depth,
scale, seats, and collaboration**, and the take-rate only ever touches a sale the **network** sourced
(free Member 10% · Crew 8% · free Space 10% · Business 5% · Collective 3% · Non Profit 0% · Independent
0%). A buyer who is already the seller's own audience is **0%**:
Frequency charges once for the introduction, and after that they're your people, free.

## 4. What a member can do at each stage (the taste)

| Capability | Visitor | Member (free) | Crew (contribute what you want) | Free Space | Business / Non Profit |
|---|---|---|---|---|---|
| Browse, RSVP, participate | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Create an event** | 🔴 | ✅ (ADR-810) | ✅ | ✅ | ✅ |
| Full game (cash-in, compete) | 🔴 | earn-only | ✅ | n/a | n/a |
| Author Journeys / Practices / Circles | 🔴 | 🔴 (Crew+) | ✅ | ✅ | ✅ |
| **Create a Space** | 🔴 | 🔴 (go Crew) | ✅ 1 space | — | ✅ unlimited |
| **Receive tips** (0% platform fee, always) | 🔴 | ✅ | ✅ | ✅ | ✅ |
| **Sell** (tickets, bookings, payments) | 🔴 | ✅ 10% network-sourced ~~(🔴 RSVPs only)~~ | ✅ 8% network-sourced | ✅ 10% network-sourced ~~(🔴 RSVPs only)~~ | ✅ 5% network-sourced (Collective: 3%), Non Profit 0% |
| **Host collaborators / co-host events** | 🔴 | 🔴 | 🔴 | 🔴 preview | ✅ Non Profit; Business previews (Collective floor, ADR-835) |
| Team seats, full CRM/email/automation, custom domain | 🔴 | 🔴 | 🔴 | 🔴 preview | ✅ |

Legend: ✅ available · 🔴 gated (upgrade prompt) · earn-only = plays but cannot cash in. Every rate shown
is **network-sourced only**: a sale to the seller's own audience (a follower, an active Space member, a
Space Contact, someone on the seller's own contact list, or a past buyer) is **0%**, and tips are 0%
everywhere (ADR-913). ⚠️ The Sell row was corrected 2026-08-19 ([ADR-914](DECISIONS.md), OWN-032): the
struck cells are the sell-wall it used to teach.

## 5. How it is enforced (and why OFF is safe)

- **Collaboration host gate** — `space_collaborators` feature gate (Collective floor since ADR-835,
  `lib/pricing/gates.ts`), read by `spaceCanHostCollaborators` (`lib/spaces/function-access.ts`) and
  enforced in the write actions (`collaborations-actions.ts` request + accept; `share-actions.ts`
  request/feature). The settings surface shows a locked preview for a lower-plan host.
- **Space-count cap** — the pure rule `canCreateSpace` (`lib/pricing/space-limits.ts`) enforced in
  `createSpace` (`lib/spaces/provision.ts`): free → 0, Crew → 1, owning a paid space → unlimited.
- **Event creation** — opened to any signed-in member (`event.create` capability in
  `lib/core/capabilities.ts`; `/events/new` page gate).
- **OFF-safe (the invariant):** every gate runs through `billingLive()` / `featureAllowed`, which
  **short-circuits to granted while `billing_live` is OFF**. ~~So today collaboration stays free +
  universal, any member creates events, and space creation is uncapped — exactly current behavior. The
  walls only bite once an operator turns billing on.~~ (Corrected 2026-08-19: `billing_live` is **ON**
  in production, so the short-circuit no longer applies and the gates above are live.) Every reader is
  additionally fail-safe (a read error degrades to granted, never a lockout).

## References

[ADR-810](DECISIONS.md) · [ADR-799](DECISIONS.md) / [SPACE-COLLABORATION-AND-SEATS.md](SPACE-COLLABORATION-AND-SEATS.md) ·
[ADR-802](DECISIONS.md) (event↔space shares) · [PRICING.md](PRICING.md) · [ROLES.md](ROLES.md) ·
[NAMING.md](NAMING.md) (Business / Non Profit designators) · [BUSINESS-MODEL-PLAN.md](BUSINESS-MODEL-PLAN.md) (free caps)
