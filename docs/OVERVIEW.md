# Frequency — the whole picture (north star)

> Front-door synthesis of what we're building and why. For the *ordered build/
> deploy path* use [START-HERE.md](START-HERE.md); for the phase tracker use
> [BUILD-PHASES.md](BUILD-PHASES.md).

## Mission (locked 2026-05-31)

> **Shared interests into real-world community: a free global mission, a game that
> drives people offline, and physical spaces where it lives.**

Frequency turns shared interests into real-world community, ending the isolation of
connection lived only through a screen. A free, worldwide **Foundation** gives anyone a
place to gather around what they love; a game rewards the things that actually build
community: showing up, inviting strangers, backing local life; and **Labs** builds the
physical third spaces, sustained by commerce, where it all takes root. One community, one
game, two engines. We measure success not by screen time but by the people who actually
practiced together this week (the North Star: Weekly Active Members, see
[BUILD-PHASES.md](BUILD-PHASES.md)).

## The thesis
The gamification isn't decoration; it's the engine that **drives offline action** (showing
up, inviting, exploring the city, supporting local life). We build the **web app as the
proving ground**, architected so the logic is **portable to mobile** and we're **never
locked into a vendor or framework**. The full two-entity model (Foundation + Labs, one
community graph) lives in [PLATFORM-VISION.md](PLATFORM-VISION.md).

Three goals throughout: **(1)** a page structure a newcomer can read without
explanation, **(2)** a gamification/engagement backbone that's extensible and
cheat-resistant, **(3)** a codebase whose value lives in portable layers, not
trapped in React/Next.

## 1. Information architecture — the spatial model
Nested scopes, biggest to smallest: **Outpost (place/city) → Nexus (regional) →
Hub (local org) → Circle (the unit).**
- **Circles** are where members live — a group practicing one thing. **Virtual is
  the default; in-person is the additive designator** (📍), with capacity/scarcity cues.
- **Interests** (renamed from "Channels") — global topics you *tune into*; Circles
  run them locally.
- **Hubs & Nexuses** are **contextual, not primary nav** — reached via breadcrumbs.
- **Nav groups:** Feed · Community (Circles, Interests, Events, Broadcast) · Connect
  (Messages, Friends, Directory) · Progress (Crew) · Manage (Admin).

## 2. Page framework — one shell, three templates
- **One app shell** — nav + content + a **scope-aware right rail**.
- **Three templates:** **Stream** (feed-like), **Index** (lists/discovery),
  **Detail** (single entity — context header + tabs + body). Templates nest.
- **Modules + slots** — reusable cards in slots, so uniformity is structural.

## 3. Inline, capability-driven admin (no separate admin world)
The *same* page shows different affordances based on **what you can do**: a host
edits a Circle **in place**, a member sees content only; your profile is
edit-in-place. Powered by **one role ladder** + **one pure capability resolver**
(`lib/core`): viewer + scope → capabilities, driving **both UI affordances and
server-side authorization** (re-checked before every mutation). `<Can>` gates
rendering; the server re-checks the same capability.

## 4. The contract layer (why mobile is cheap later)
**Presentation-neutral view models** (`CircleView`, `ProfileView`, `FeedView`)
carry **data + the viewer's capabilities** together. **View-builders** compose
them; web renders now, **mobile consumes the identical shapes later**. Logic isn't
trapped in components.

## 5. Gamification / engagement — the differentiator
Pipeline: **SOURCE → VERIFY → LEDGER → RULES → REWARD.**

**Two currencies, split by where the activity happens:**
- **Gems** = internal/web engagement (posts, comments, reactions, logins, RSVPs) —
  the **spendable** currency.
- **Zaps** = external + **in-person** (outreach, invites, in-person event hosting,
  ghost-node captures, business/NFC programs) — **seasonal XP** driving **season
  ranks** (ghost → runner → operative → agent → conduit → luminary).
- **Season rollover:** zaps **convert to gems** at season end (rank-based rate);
  trophy minted; counters reset.
- **Store:** gems buy **digital badges/cosmetics** and **trade for physical merch**.

**The backbone (built in front of the existing achievements/quests/challenges/
streaks engine, which is preserved):**
- **Event ledger** — append-only, **exactly-once** (idempotency), source-tagged.
- **Physical triggers (nodes)** — **QR codes, NFC plaques/merch tags, geocache
  "ghost nodes."** Every capture logged.
- **Server-authoritative verifier** — validity window, signed payload, capture
  rule, **PostGIS proximity**. Trust on the server, never the device.
- **Capture orchestration** — verify → ledger → capture → award zaps.
- **Partners / businesses module** — geolocated **directory** of aligned local
  businesses; an NFC plaque is a *node linked to a partner*; bump → **discount +
  zaps**; offers + redemptions tracked.
- **Async lane** — durable job queue + cron with **retries/backoff**, so rewards/
  notifications don't drop when a provider is down.

## 6. Scale & lock-in resistance (the foundation)
**Layered separation** so no vendor traps us: **core** (pure logic) · **contract**
(view models) · **capabilities** (authz) · **tokens** (cross-platform design
tokens) · **DB as source of truth** (migrations). **PostGIS** for real geography.
**Phase 5 mobile** (Expo/RN) is a thin client over the proven contract — not a rewrite.

## Status (high level)
- **Phase 0 (foundations):** ✅ done.
- **Phase 1 (page structure):** quick wins shipped; inline-admin/template **wiring
  parked** for when the app's running (layout, needs visual QA).
- **Phase 2 (authz contract):** view-builders started; RLS read migration remains.
- **Phase 3 (gamification):** ✅ backbone complete; UI wiring + realtime + reward
  *amounts* remain.
- **Phase 4 (scale):** later, metric-driven. **Phase 5 (mobile):** later, on the contract.
