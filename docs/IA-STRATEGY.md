# Information Architecture & Feature Strategy

> Working strategy doc — how Frequency's features should be **organized, named,
> nested, and progressively revealed** so a brand-new visitor instantly
> understands the place. This is the "why" behind layout/nav decisions. It does
> **not** build onboarding yet — it defines the model onboarding will plug into.
>
> Pairs with [GLOSSARY.md](GLOSSARY.md) (domain terms) and [ROADMAP.md](../ROADMAP.md).

---

## 0. The core problem

The model is good; the *presentation* over-exposes it. A first-time member is
shown four hierarchy words at once — **Circles, Channels, Hubs, Nexuses** — plus
Feed, Broadcast, Events, Messages, Friends, Directory in one flat left rail. But
per the glossary, **Hubs and Nexuses *emerge* from clustering and are
admin-grade**. We're asking newcomers to hold the org chart in their head before
they've joined a single group.

**Guiding principle:** a member only ever needs two belonging-words —
**Circle** (my local group) and **Channel** (my topic). Everything structural
(Hub, Nexus, Outpost) is scaffolding they *encounter contextually*, never
primary navigation. Match information to readiness instead of front-loading it
(progressive disclosure).

---

## 1. Three-tier mental model

Sort every feature into one of three altitudes. The left nav should *look* like
these tiers (grouped, with quiet section labels — Circle.so calls these "Space
Groups"; grouping is the single biggest cognitive-load reducer in a sidebar).

| Tier | Question it answers | Features |
|---|---|---|
| **Activity** (me, now) | "What's happening for me?" | Feed, Messages, Notifications, my Events |
| **Belonging** (where I participate) | "Where do I show up?" | **Circles**, **Interests**, Events |
| **Discovery** (find more) | "What else is out there?" | Directory / People, Discover (map), browse Interests |
| *Structure / leadership* (role-gated) | *"How is this run?"* | *Hubs, Nexuses, Broadcast, Crew, Admin* |

### Proposed left-nav grouping

```
  Feed                         ← no header, the home base

  MY COMMUNITY
  Circles                      ← local groups (always virtual; some meet in person)
  Interests                    ← topics you practice (was "Channels")
  Events

  CONNECT
  Messages
  Friends
  Directory

  PROGRESS        (crew+)
  Crew

  MANAGE          (host+)
  Broadcast
  Admin
```

**Move Hubs & Nexuses out of primary nav for members.** They become:
- a contextual breadcrumb/link on a Circle page ("Part of the *Austin Hub*"),
- and full pages inside **Admin** (where `/admin/hubs`, `/admin/nexuses` already
  live). The member-facing `/hubs` and `/nexuses` routes stay reachable by link,
  just not advertised in the chrome.

> Already half-done: `app-shell.tsx` `isActive()` folds `/hubs` and `/nexuses`
> under the **Circles** nav item. That's the right instinct — finish the thought
> by removing them as standalone destinations from the member rail.

---

## 2. Progressive disclosure — the "wake up" gating model (design now, build later)

Two independent gates decide whether a feature is **locked / available / hidden**:

1. **Role gate** — already implemented (`member < crew < host < guide < mentor <
   janitor`). Crew/Admin/Broadcast already hide below their role.
2. **Onboarding-milestone gate** — *new concept to design.* A feature can be
   visible-but-**dimmed** with a lock affordance until the member completes the
   step that makes it meaningful. This is "progressive enabling" (the video-game
   pattern: abilities unlock as you progress). Contextual onboarding of this kind
   measurably lifts completion and conversion.

### Three states per feature
- **Locked** — greyed, lock icon, tooltip: *"Join a Circle to unlock your Feed."*
  Visible so the member sees the road ahead (a map, not a wall).
- **Available** — normal, interactive.
- **Contextual** — doesn't appear until relevant (e.g. host tools only after you
  host).

### The unlock spine (reuse what exists)
`GettingStartedChecklist` already tracks: add avatar → write bio → **join a
Circle** → first post. Promote that from a sidebar widget into the *unlock
spine*:

| Milestone | Unlocks |
|---|---|
| Account created | Profile, Circles browse, Channels browse, Directory |
| **Joined a Circle** | Feed (full), Events, posting, the Circle's interior |
| Upgraded to Crew | Crew dashboard, leaderboard, gamification *(role gate, exists)* |
| Became Host | Broadcast, Admin *(role gate, exists)* |

**Existing precedent:** `components/crew-gate-button.tsx` already implements the
locked state — it wraps a feature and pops a "Crew Access Required → Upgrade to
Crew" modal. The milestone gate is the same idea generalized beyond role: one
component, parameterized by *which* gate (role *or* milestone) is unmet and what
copy/CTA to show.

**Build note (later):** keep gates **declarative** — one config map that *both*
the nav renderer and the onboarding flow read, so they never drift. Persist
state on `profiles.meta` (already holds `onboarding_completed`). Do **not** build
the flow yet; just define the map when we get there.

> ⚠️ Tension to resolve: today's Circle/Hub/Nexus pages render the **full
> breadcrumb** (Region → Outpost → Nexus → Hub). That's the over-exposure
> problem in miniature — it shows a newcomer the whole org chart on their first
> Circle visit. Soften it: lead with *place* ("Austin · East Side"), make the
> structural ancestry a secondary, collapsible line.

---

## 3. Virtual is the baseline; in-person is an additive designator

**The mental model (decided):** *Every Circle is virtual.* Each one has an
always-on virtual space — that's the universal floor. **Some Circles also meet in
person** — those carry a small in-person **icon designator** *and* a **tighter
member cap**. In-person is not the opposite of virtual; it's a *property layered
on top* of a circle that is always virtual underneath.

This matters because it's Frequency's differentiator (the roadmap reframe:
"embodied practitioners," not creators marketing to an audience) **and** because
it's the engine of how the community spreads (see §3a).

Today `circles.type` = `in-person` | `online` and `/circles` renders the raw
word — a missed chance.

**Recommendations**
- **Don't badge "Virtual" — it's the assumed default.** Showing "Virtual" on
  every card is noise. Instead, **mark in-person circles with a small icon** (📍
  / a place glyph) and leave virtual-only circles unmarked. The icon *is* the
  signal; absence of icon = virtual-only. (This is exactly your instinct: notate
  in-person, everything else is virtual.)
- **Tighter cap on in-person**, surfaced as `12 / 24 spots`. The cap is not just
  scarcity — it's a *design constraint that forces the circle to split* (§3a).
  Virtual-only circles can run a larger or softer cap.
- **In the Circle header, state the dual nature once:** for an in-person circle,
  *"Meets in person in Austin · Always-on virtual space."* For virtual-only,
  just the virtual space. Never make the member wonder which they're joining.
- **Filter on `/circles`:** `All · Meets in person (near me) · Virtual only`.
  Wires into planned map discovery (ROADMAP P3.14 — `circles` already has
  `lat/lng/city`). The in-person filter is the high-intent path.

### 3a. The growth loop — circles split to spread (the core mechanic)

Circles are **designed to divide**: a circle fills its (tighter, for in-person)
cap → it spins off a new circle → neighbouring circles cluster into a **Hub** →
hubs cluster into a **Nexus**. *That* is why Hubs and Nexuses exist — they're the
**emergent result of cell division**, not top-down containers. (Matches
`GLOSSARY.md`: "Hubs and Nexuses *emerge* from clustering.")

Design implications:
- **The cap is a feature, not a limit.** When a circle nears its cap, the UI
  should celebrate it and offer the next step: *"This circle is nearly full —
  ready to seed a new one?"* (host-facing). Frame fullness as success +
  multiplication, not a closed door.
- **Make lineage visible, lightly.** A new circle that split off another can show
  *"Grew out of [parent circle]."* This tells the spread story and gives the new
  circle instant social proof — without exposing the whole org chart.
- **Hubs/Nexuses surface as the *outcome* of this loop**, contextually on the
  circle page ("Part of the Austin Hub — 4 circles"), never as primary nav (§1).
  A member reads them as "look how this grew," not "here's the admin tree."

---

## 4. The nested / fractal layout (the big structural idea)

Your instinct — the whole site is `top bar + left nav + right "what's going on"`,
and an interior page (a Circle, a Channel) **repeats that same shape at a smaller
scale** — is a strong, recognized pattern. One spatial logic learned once, reused
everywhere (consistency & recognition-over-recall).

**The one trap to avoid:** don't literally render a *second left nav* inside the
page. Two stacked sidebars at desktop width is the #1 way nested layouts turn to
clutter. Instead, express "nesting" through three lighter devices:

### Global shell (unchanged)
- **Top bar** — global header: logo, search, notifications, messages, account /
  admin. *(`app-shell.tsx` already does exactly this.)*
- **Left nav** — global, grouped per §1. Stays global even on interior pages, so
  the member never loses orientation.
- **Right sidebar** — global "community pulse" (see §5).

### Interior context (e.g. `/circles/[slug]`) — the nesting
1. **Context header band** inside the content area: banner, Circle name,
   in-person/virtual badge, member count, Join/Leave, and a host-only gear for
   *that Circle's* admin functions. This is the interior "header."
2. **Context tabs** (not a sidebar): `Posts · Events · Members · About`. Interior
   navigation lives here.
3. **Right sidebar swaps to context scope**: *this Circle's* upcoming events,
   *this Circle's* online members, *this Circle's* dispatches, *this Circle's*
   weekly practice (ROADMAP P2.11). Same component, scoped data.

So the fractal is: **header + scoped right-rail + tabs** at every level —
identical grammar, different scope. This is exactly how Slack/Discord/Circle
handle interior context (channel header + member rail), and it scales without
double chrome.

**Build note (later):** Next.js nested layouts make this clean — a
`app/(main)/circles/[slug]/layout.tsx` renders the context header + scoped rail
and slots the tab pages as children. Generalize `RightSidebar` (it already takes
`circleIds`) to accept a **scope** (`global | circle | channel`). Same for
`/channels/[id]`.

---

## 5. Right sidebar = "community pulse" (the blog-sidebar role)

You want a blog-style sidebar: no traditional ads, but **site-/community-wide
updates and stats**. The current rail already runs Getting Started, Dispatches,
Events, Members, Leaderboard, Progress — a good base. Shape it into a deliberate
"pulse":

- **Announcements (pinned, top)** — janitor/site-wide updates. The "what's new"
  block. Distinct from circle-scoped dispatches. (Best home for community-wide
  news without an ad slot.)
- **Community stats / social proof** — *members online now, active circles,
  events this week, new members this week.* Liveliness signals drive engagement.
- **Then the existing cards** — Dispatches, Upcoming Events, Members.
- **Scope-aware:** global scope → whole-community pulse; Circle scope → that
  Circle's pulse (§4). Same component.
- **Discipline:** 3–5 cards visible max — cognitive-load limits apply to
  sidebars too. Each card is scannable and links deeper.

---

## 6. Naming — "Channels" → "Interests" (decided)

"Channel" was overloaded two ways: internally (`topical_channels` vs legacy
`channels`) and externally (Discord/Slack/YouTube all mean "chat room /
broadcaster"). **Decision: the member-facing label is "Interests."**

- **Member-facing "Interests"** = the global topics a circle practices
  (Spirituality, Movement, Holistic Health, Human Relating, Activism, Creative,
  Business Support). Warm, personal framing that reads naturally in the
  wake-up/onboarding flow ("pick your interests").
- **Retire the legacy `channels` concept from member view** — keep it only in
  `/admin/channels`.
- **Migration surface:** nav label, the `/channels` route (consider redirecting
  `/channels` → `/interests` or just relabeling the nav while keeping the route
  short-term), page headings, and onboarding copy. The DB table
  `topical_channels` can keep its name — this is a *presentation* rename, not a
  schema one, so it's low-risk.

---

## 7. Summary of recommended moves

| # | Move | Effort | Existing hook |
|---|---|---|---|
| 1 | Group left nav into MY COMMUNITY / CONNECT / PROGRESS / MANAGE | S | `SIDEBAR_NAV` in `app-shell.tsx` |
| 2 | Demote Hubs & Nexuses from member nav → contextual + admin | S | `isActive()` already folds them under Circles |
| 3 | In-person icon designator (virtual = unmarked default) + tighter in-person cap on `/circles` | S | `circles.type`, `member_cap` |
| 3a | "Nearly full → seed a new circle" prompt + circle lineage ("grew out of …") | M | `member_count`/`member_cap`, circle parent ref |
| 4 | Define the role + milestone unlock map (declarative, no flow yet) | M | `GettingStartedChecklist`, `profiles.meta` |
| 5 | Interior context shell: header + tabs + scoped right rail | M | Next.js nested layouts; `RightSidebar(circleIds)` |
| 6 | Make `RightSidebar` scope-aware (global / circle / channel) | M | `RightSidebar` already takes `circleIds` |
| 7 | Add Announcements + community-stats cards to the pulse rail | S | right-sidebar widgets |
| 8 | Relabel member-facing "Channels" → "Interests" (presentation only) | S | nav + `/channels` route + copy |

Start with 1–3 + 8 (pure clarity wins, low risk), then 4–7 (the structural
backbone). 3a (the growth loop) is the highest-leverage *product* idea here —
it's what makes the hierarchy spread instead of just exist.

---

## Decisions locked (this session)

- **Belonging words = Circle + Interest.** "Channels" is relabeled **Interests**
  (presentation rename; `topical_channels` table keeps its name).
- **Hubs & Nexuses = contextual only** — out of member nav, shown as the
  *emergent outcome* of circles splitting (§3a) + in Admin.
- **Virtual is the default; in-person is an additive icon designator** with a
  **tighter cap**. Don't badge "virtual"; mark in-person, leave the rest blank.
- **Circles are designed to split to spread** — the cap is a growth trigger, and
  Hubs/Nexuses are what that growth *produces*.

---

## Refinement (session 2) — the two-strategy crossover

Frequency runs **two structures** that share the same words but play different
roles. A member's journey is the **crossover** between them: virtual entry →
local commitment → embodied gathering.

### A. In-person: the church *growth* model (a nested gathering ladder)

> **Secular by design.** We borrow *how churches grow and plant new locations* —
> the cell-multiplication mechanics — and nothing else. No religious framing, no
> religious role names. Frequency is not religious or religiously affiliated.

- **Frequency Lab** — an in-person **third space** (a physical venue); nodes in a
  worldwide network. A Lab is **earned, not pre-placed**: it sprouts up where
  demand is already proven (§D2). It's the **physical graduation of a mature
  neighborhood (Hub)**, not a container you slot circles into. Circles and Hub
  gatherings come first; the Lab is what their growth earns.
- **Circle** — the small group, weekly practice; meets at/near a Lab if in-person.
- **Hub** — the *neighborhood*: the cluster of circles in a locale, **and itself
  a gathering body** — community meetups, parties, bigger events.
- **Nexus** — the *whole area*: gathers quarterly — galas, big events.
- **Mentor** — an **oversight/support role, not an operational one.** Looks after
  the **guides** (and through them the health of all their circles); doesn't run
  day-to-day operations. Plain secular language; the authz ladder is unchanged.

> Insight: **every tier is a gathering body with its own cadence** — Circle
> (weekly) → Hub (neighborhood meetup) → Nexus (quarterly gala). This is why the
> fractal UI (§4) is right — it mirrors a fractal *org*, not just a layout taste.

### B. Virtual: the topic engine (Interests = catalog + spawn point)

- **Interests/Topics are virtual and global** — everyone, no place required.
- Each Interest holds three things: **virtual discussion**, a **program**
  (curriculum / practices / meetup templates), and a **roster of circles**
  practicing it.
- **Program lives as a template at the Interest level; it is *dispensed into* a
  circle on adoption.** Topic = master/library; Circle = running instance. (Ties
  to ROADMAP P2.11 `circle_weekly_practice` + P2.12 practice library.)
- **"Add to Circle" / adopt** opens a *new* circle pre-loaded with that program,
  and makes the adopter its **host**.

### C. The crossover arc — the onboarding/"wake-up" spine

1. Sign up → **pick Interests** (pure virtual).
2. **Join a circle** *or* **adopt an Interest's program** (→ become host, spawn a
   circle).
3. Circle runs its program; attend first session.
4. **Go in-person** — meet at the neighborhood **Lab**.
5. Attend a **Hub meetup** (neighborhood).
6. Attend a **Nexus gala** (area, quarterly).

Each step reveals the next tier — this *is* the milestone-gating model (§2). The
"wake up" is not a one-time form; it's this ladder lighting up over time.

### D. Two ways a circle is born (unifies the growth loop §3a)

1. **Split** — a circle hits its (tighter, in-person) cap → seeds a child circle.
2. **Adopt** — someone takes an Interest's program → opens a new circle around it.

Both produce circles; circles cluster into Hubs; Hubs into Nexuses. Growth is
**bottom-up**; Hubs/Nexuses are the *emergent result*, surfaced to members as
**places + events**, never as nav.

### D2. The growth engine *is* the marketing engine

For in-person circles especially, splitting/growth is **how the message spreads
and how we prove demand for a third space before spending on marketing or real
estate.** A neighborhood whose in-person circles keep filling and splitting is a
*validated market* — and that signal is what justifies opening a physical
**Frequency Lab** there. Build the space (and market it) *after* the need is
proven, not before.

The platform's job is to make that demand **legible**: a "this neighborhood is
ready for a Lab" signal — a demand heatmap of growing/splitting in-person circles
(ties to ROADMAP P3.14 map discovery; `circles` already has `lat/lng/city`).
This is a leadership/admin surface, not member nav.

### E. Discovery & entry (the browse-first onboarding)

- **Browse-first onboarding.** A newcomer explores **Topics/Interests** and is
  prompted to either **join a circle** or **start a circle** straight from a
  topic — low-commitment entry, exactly the progressive-disclosure pattern.
- **Find circles by need.** `/circles` should let members **filter by multiple
  topics** (multi-select) plus mode (*in-person near me* / *virtual*) to find
  circles that fit.
  - ⚠️ *Schema implication:* today a circle declares **one** topic
    (`circles.topical_channel_id`). Multi-topic discovery wants either a
    **many-to-many** circle↔topic tagging or a **primary + secondary tags**
    model. See open question #5.

### How this lines up with the prior strategy

- ✅ **Hubs/Nexuses contextual-only** — *strengthened.* Members meet them as *the
  Lab*, *the neighborhood meetup*, *the quarterly gala* — places and events.
- ✅ **Virtual default, in-person additive** — holds. Virtual-only = Interest +
  virtual space; in-person additionally anchors to a Lab and joins the ladder.
- ✅ **Growth loop (§3a)** — enriched with a second spawn path and a clear
  endpoint (Hub/Nexus gatherings).
- ✅ **Fractal layout (§4)** — now justified by org reality, not UI taste.
- ✅ **Milestone gating (§2)** — gets its concrete spine: the crossover arc (C).
- ✅ **Interests rename (§6)** — fits; Interests now also = program catalog +
  circle spawn point.

### Open structural questions (resolve before building)

1. **What is a "Frequency Lab" in the schema?** A physical third-space venue a
   neighborhood *earns* once demand is proven (§D2) — the graduation of a Hub,
   **not** the `outposts` concept (which sits above Nexus). Recommend a
   `labs`/venue entity linked to a Hub, created when demand thresholds are met.
2. **Hub- and Nexus-scoped events** (meetups, galas) — do `events.scope_type`
   values support hub/nexus? If not, that's the gap the church model requires.
3. **Program model** — confirm Interest-level template → circle-level instance
   (P2.11/P2.12). "Add to Circle" = instantiate program + set adopter as host.
4. **Mentor copy** — describe as oversight/support of guides (non-operational),
   in plain secular language, without changing authz.
5. **Circle ↔ topic cardinality.** One topic per circle today vs. the multi-topic
   discovery the onboarding wants. Decide *single-primary + tags* or full
   *many-to-many* (§E).
6. **Demand signal** — define what "proven demand" means numerically (e.g. N
   active in-person circles + M splits within a radius) so the "ready for a Lab"
   surface (§D2) can be built later.
