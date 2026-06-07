# Roles & access — the canonical model

> Source of truth for Frequency's role architecture. Mirrors the Notion "Roles &
> Community Map" (training view). Status: **design — not yet built** (the current code
> still uses the old global `community_role` enum incl. admin/janitor; build plan in
> [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md) §11, decision in
> [DECISIONS.md](DECISIONS.md) ADR-163).

## The shape: three independent systems + a billing entitlement

Access is the **union** of four orthogonal things. A person can hold a position in each
at once (e.g. a **Host** of one circle, a paid **Member**, a **Practitioner + Collaborator**,
and **Support** staff). Adding a role anywhere lights up its surfaces; nothing else changes.

| Layer | Answers | How you get it | Stored as | Stack? |
|---|---|---|---|---|
| **1 · Community** | how much do you steward, *where*? | community position | stewardship **edges** (role × place) | one per scope |
| **· Entitlement** | free, member, or supporter? | self-serve billing | flag | n/a |
| **2 · Partners** | what are you here to do/sell? | **sign up** for the account role | persona rows (multi-select) | yes — any combo |
| **3 · Admin** | what platform tooling do you run? | granted, top-down | super-ladder + capability matrix | one |

## The place tree + overlays

**Backbone (geographic spine):** **Nexus → Hub → Circle.** Nexus is the top community
unit; city/region grouping is `nexus_regions`. *(Outpost is no longer the top container.)*

**Overlays** — cross-link members & circles, two twins:
- **Channel** — the **online** topical overlay (links members & circles by interest).
- **Outpost** — the **in-person** twin: a local *clubhouse / Club* that forms **inside a
  Nexus**, cross-engages its Circles, and hosts the **primary local events**. Aspirationally
  housed in a **Frequency Lab** (a for-profit venue program). An Outpost exists with or
  without a Lab and "graduates" into one when it opens.

## System 1 — Community (scoped stewardship ladder)

A role is a **stewardship edge** `(person · role · scope)`; the global level is *derived*
from the highest edge. Platform `admin`/`janitor` are **not** here (→ System 3).

| Role | Scope | Responsibility | Unlocks |
|---|---|---|---|
| 🌱 **Member** | global (base) | participate, show up, contribute | post/engage, RSVP, log practices, DM friends |
| ⚙️ **Crew** | a Circle | volunteer support + accountability | circle admin dashboard + task list; admin-helper |
| 🔑 **Host** | a Circle | **admin-manages their own circle(s)** as host | manage circle page, set events, dispatch, `@everyone`, DM/group within the circle |
| 🧭 **Guide** | a Hub | **oversees a Hub of local circles** | manage all circles under them; `@hosts`; `@hub` dispatch + hub dashboard |
| 🌟 **Mentor** | a Nexus | **oversees the Guides' hubs** (a Nexus of hubs) | `@nexus`; deep Nexus admin dashboard |
| 📍 **Outpost Lead** | an Outpost *(overlay)* | convenes the local in-person community | runs the Outpost's events + calendar; cross-engages its Circles; usually also a Host/Guide/Mentor |

Broadcasts flow **downward by scope**: Mentor → Nexus · Guide → Hub · Host → Circle ·
Channel/Outpost lead → its members.

## Entitlement — Free → Member → Supporter (billing axis)

Orthogonal to every role.

| Tier | Cost | Access |
|---|---|---|
| 🆓 **Free** *(default)* | $0 | The **entire program** — community, circles, practices, events, Capture, messaging — **except gamification (the Quest cash-in) and special role/partner features**. |
| 💳 **Member** *(paid membership)* | paid | **Everything** — gamification on (claim/spend/compete; rewards already accrue for all in the Vault) **+** the special role/partner features. |
| 💖 **Supporter** | pays more | Everything a Member has, **plus a special Supporter badge** — recognition for contributing beyond the membership. |

*(Replaces the old "crew = paid" overload: Crew is now purely a stewardship role; paying is this axis.)*

## System 2 — Partners (self-serve account roles · multi-select hats)

Sign up → a feature suite + own dashboard. Verified where money moves. Stack any; they sit
on top of normal Community membership.

| Partner | Who | Unlocks | Money |
|---|---|---|---|
| 📣 **Collaborator** | influencers, authors, teachers, speakers **with an audience** | bring-your-audience tools; their Practices/Journeys in a **featured directory**; **influencer program** (kickbacks tied to their activity + gamification) | affiliate kickbacks |
| 🧘 **Practitioner** | healers, breathwork, yogis **running their own client network** | **host paywalled Programs** (Practices + Journeys) + **gamify clients' progress**; private Channel + private Circles — under the Frequency brand | Stripe Connect (verified) |
| 🏪 **Business** | local businesses | business **listing** + network integration; **loyalty rewards**; **CRM**, **web builder**, deep business tools | payments + loyalty |
| 🏢 **Organization** | nonprofits / orgs | a full suite tied to whoever's tagged with the org: their own **sub-community on Hook**, CRM, gamification, promotion | tenant billing |

**Organization isolation rule.** An org runs its **own editable admin/staff roles inside its
Hook tenant**. On the main Frequency site that admin **does not bleed over** — org people are
Frequency participants *tied to* the org (an organizer is usually Crew, may also be Host/Guide/
Mentor). **Collaborator vs Practitioner** = *audience / personal-brand + affiliate* vs
*run-your-own-network + gamify-your-clients*.

## System 3 — Admin (internal platform staff)

A small **super-ladder** at the top, then domain-scoped capability roles. The old community
`janitor`/`admin` live here now.

| Role | Access |
|---|---|
| 🛡️ **Janitor** | The mega role — **everything**: financials, destructive DB edits, sensitive owner features, role-granting, the permission grid. *(The joke: the highest role leads from service.)* |
| 🗝️ **Admin** | Almost everything — runs the platform, assigns roles below — **except** financials (write), destructive DB edits, sensitive owner features. |
| 🛠️ **Operations** | circles · channels · events · structure · members · moderation · QR |
| 📈 **Marketing** | marketing · CRM · outreach · segments · growth |
| 💰 **Accounting** | billing · subscriptions · payouts *(members read-only)* |
| 🎧 **Support** | moderation · member assist · help gaps |
| 📊 **Analyst** | read-only across insights & analytics |

Everything below Admin is **specced under Admin** as domain-scoped capabilities.
Organizations get their **own** instance of this matrix, sandboxed to their tenant.

## How it composes (one resolver)

```
access = union of
   each Community stewardship edge (scoped to its circle / hub / nexus / outpost)
   the Entitlement tier (free → member → supporter)
   each active Partner persona
   the Admin role × its domains            (Frequency platform only)
   …inside a Hook tenant only:
   the Org's own scoped staff role         (never crosses to Frequency)
```

## Data model

| Layer | Store as |
|---|---|
| Community | **`stewardships`** — `profile_id, role(crew/host/guide/mentor/outpost_lead), scope_type(circle/hub/nexus/outpost), scope_id, state`. Member implicit via `memberships`; cache `community_level` for fast global gates. |
| Entitlement | membership/subscription flag — `tier(free/member/supporter)` + game-claim state. |
| Partners | **`profile_personas`** — `profile_id, persona, state, stripe_account_id?, entity_id?` (multi-row). |
| Admin (platform) | **`team_members`** — `profile_id, staff_role` → domains via matrix; Janitor/Admin the super-tiers. |
| Org (Hook) admin | **tenant-scoped** staff rows on the org's Hook instance — isolated; never read by the Frequency resolver. |
| Overlays | **`outposts`** `(nexus_id, lab_id?, place)` + **`labs`** (for-profit venues) + `channels`; members affiliate via join rows; events can scope to an outpost. |
| All | one **capability resolver** computing the union per request/context (extends ADR-017). |

## Migrations from today

- `community_role` global enum → **derived from `stewardships`** (keep a denormalized cache).
- `janitor`/`admin` → the **Admin system** (super-ladder), out of the community ladder.
- `crew` (entitlement) → the **Free / Member / Supporter** axis; **Crew stays** as the
  circle-stewardship role; `isCrew`/`/upgrade`/game-eligibility re-point to the entitlement.
- **Outpost** repurposed: city-container → in-person overlay inside a Nexus; drop the old
  `Outpost → Nexus` containment; add `outposts`/`labs` + `scope_type='outpost'` + Outpost Lead.

## Open decisions

- **Organization** — partner persona that carries tenancy, or its own tenant tier?
- Confirm the **Collaborator vs Practitioner** line.
- Does **Crew** get cross-Circle visibility by default? (today: Circle-anchored unless promoted.)
- Pin exactly which **"special role/partner features"** gate behind the paid Member tier.
