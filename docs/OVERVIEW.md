# Frequency: the whole picture (early synthesis)

> ⚠️ **Not the north star.** Product law is [CORE-MODEL.md](CORE-MODEL.md) (ADR-1294)
> and [NAMING.md](NAMING.md). Status lives in [BUILD-BACKLOG.json](BUILD-BACKLOG.json).
> The live plan is [AGENTS.md](../AGENTS.md) §"Which plan is live". Orientation:
> [START-HERE.md](START-HERE.md). [BUILD-PHASES.md](BUILD-PHASES.md) is history.
> Where this file disagrees with those, ignore this file.

## Mission (updated 2026-09-18 to match CORE-MODEL)

> **People join free. Businesses host free. You pay when you start charging.**

Frequency is a Community Collective: one graph, two money entities (Foundation + Labs),
one game. **Members** join free. **Spaces** host free. **Circles** are the rooms.
**Events** are when those rooms are open. Topics are **Channels**. **The Quest** rewards
showing up, inviting, and backing local life. We measure success by people who actually
practiced together this week (Weekly Active Members), not by screen time. Full model:
[CORE-MODEL.md](CORE-MODEL.md) and [PLATFORM-VISION.md](PLATFORM-VISION.md).

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

## 1. Information architecture: the four nouns
Product nouns ([CORE-MODEL.md](CORE-MODEL.md)): **Member · Space · Circle · Event.**
Topics are **Channels** ([NAMING.md](NAMING.md)); "Interests" is retired.
Hub, Nexus, and Outpost are the place-clustering tree, contextual, not primary nav.
The member rail is five worlds (Home · Practice · Community · The Quest · Manage).
See [IA-STRATEGY.md](IA-STRATEGY.md) for the spine; ignore any "Interests" wording
still in the older sections of that file.

## 2. Page framework: one shell, a small kit
- **One app shell:** nav + content + the global right rail.
- **Pick a shell** from `@/components/templates` by what the content is (Stream,
  Index, Detail, plus Focus / Dashboard / Wizard / Admin). Do not restate a count.
  Full spec: [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md).
- **Modules:** capability-composed cards, not a static widget board.

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

## 5. Gamification / engagement: the differentiator
Pipeline: **SOURCE → VERIFY → LEDGER → RULES → REWARD.**

**Two currencies, split by where the activity happens:**
- **Gems** = internal/web engagement (posts, comments, reactions, logins, RSVPs):
  the **spendable** currency.
- **Zaps** = external + **in-person** (outreach, invites, in-person event hosting,
  ghost-node captures, business/NFC programs): **seasonal XP** driving season
  ranks ([NAMING.md](NAMING.md): Ghost → Initiate → Adept → Master). The old
  Echo/Signal/Beacon ladder is retired.
- **Season rollover:** zaps **convert to gems** at season end (rank-based rate);
  trophy minted; counters reset.
- **Store:** gems buy **digital badges/cosmetics** and **trade for physical merch**.

**The backbone (built in front of the existing achievements/quests/challenges/
streaks engine, which is preserved):**
- **Event ledger:** append-only, **exactly-once** (idempotency), source-tagged.
- **Physical triggers (nodes):** **QR codes, NFC plaques/merch tags, geocache
  "ghost nodes."** Every capture logged.
- **Server-authoritative verifier:** validity window, signed payload, capture
  rule, **PostGIS proximity**. Trust on the server, never the device.
- **Capture orchestration:** verify → ledger → capture → award zaps.
- **Partners / businesses module:** geolocated **directory** of aligned local
  businesses; an NFC plaque is a *node linked to a partner*; bump → **discount +
  zaps**; offers + redemptions tracked.
- **Async lane:** durable job queue + cron with **retries/backoff**, so rewards/
  notifications don't drop when a provider is down.

## 6. Scale & lock-in resistance (the foundation)
**Layered separation** so no vendor traps us: **core** (pure logic) · **contract**
(view models) · **capabilities** (authz) · **tokens** (cross-platform design
tokens) · **DB as source of truth** (migrations). **PostGIS** for real geography.
**Phase 5 mobile** (Expo/RN) is a thin client over the proven contract, not a rewrite.

## Status (high level)
Do not use this section. Run `pnpm backlog`. The phase checklist below is 2026-05
history.
