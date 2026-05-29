# Frequency

A platform for **place-based, in-person community practice** — local **Circles**
that gather around shared **Interests**, growing into neighborhood **Hubs** and
area **Nexuses**, with a gamified, physical-world engagement layer (QR / NFC /
geolocation). **Mobile-first** (the app is the primary doorway; the web is the
secondary surface and the SEO/discovery front).

Current build: **Next.js 16** (App Router / RSC) + **Supabase** (Postgres, Auth,
Realtime, Storage) on Vercel, **Tailwind v4**.

---

## Where documentation lives — two homes, on purpose

| Home | Audience | Contains |
|---|---|---|
| **GitHub** (`/docs`, `/ROADMAP.md`, this README) | **Developers** | architecture, schema, conventions, the build plan — everything technical |
| **Notion** | **Users, admins, hosts, training** | how features work, host/admin guides, onboarding/training, community policy |

**Rule of thumb:** if it tells a *developer how to build it*, it goes in Git. If
it tells a *person how to use it*, it goes in Notion. Don't cross the streams —
keep Git technical and Notion human. (Proposed Notion structure is sketched at
the bottom of this file.)

---

## Architecture at a glance

Five layers separated by stable contracts, so **no single framework choice can
trap us** (full rationale in [SCALE-ARCHITECTURE](docs/SCALE-ARCHITECTURE.md)):

```
 PRESENTATION   web: Next.js/RSC · mobile: Expo/RN (later) · design tokens · headless UI   ← replaceable
 COMPOSITION    server-composed capability MODULES, chosen per user by role + involvement
 CONTRACT       one typed, presentation-neutral contract (RPC view-models)  ← shared by web + mobile
 DOMAIN/CORE    business rules + capability resolver, framework-independent
 DATA           Supabase/Postgres (+PostGIS) as source of truth · AUTHZ = RLS + SECURITY DEFINER RPCs
```

Engagement/gamification rides on top as one pipeline
([ENGAGEMENT-ARCHITECTURE](docs/ENGAGEMENT-ARCHITECTURE.md)):

```
 SOURCE adapters (web · task · QR · NFC · geo · P2P) → server VERIFICATION
   → append-only EVENT LEDGER + rules → REWARD ledger (+ realtime feedback)
```

**The one decision everything hinges on:** the **contract + capability layer** —
presentation-neutral data, computed server-side, consumed identically by web and
mobile.

---

## Documentation map

### Strategy & target architecture (the plan — read in this order)
1. [IA-STRATEGY](docs/IA-STRATEGY.md) — information architecture: Circle + Interest
   as the only member-facing words; Hubs/Nexuses contextual; in-person designator;
   role + milestone "wake-up" gating. (Labs/demand-proving are out of website scope.)
2. [PAGE-FRAMEWORK](docs/PAGE-FRAMEWORK.md) — one shell, 3 page templates
   (Stream / Index / Detail), composable modules + slots. *(Reads "widget" =
   module card UI — see its terminology note.)*
3. [SCALE-ARCHITECTURE](docs/SCALE-ARCHITECTURE.md) — the 5-layer lock-in-resistant
   model, RSC/PPR rendering, Postgres scaling seams, future-proofing.
4. [CAPABILITIES-AND-MOBILE](docs/CAPABILITIES-AND-MOBILE.md) — one capability
   resolver powering inline admin + cross-platform parity; why authz converges on
   RLS + RPCs.
5. [ENGAGEMENT-ARCHITECTURE](docs/ENGAGEMENT-ARCHITECTURE.md) — the event →
   verify → ledger → reward backbone hosting all gamification sources.
6. [TECH-STRATEGY](docs/TECH-STRATEGY.md) — the capstone: recommended stack,
   decisions made, and the phased plan.

### Executable plan
- [**START-HERE**](docs/START-HERE.md) — **go-live runbook.** Ordered steps to apply
  migrations, regenerate types, run & QA, then continue development. Open this first
  at a computer.
- [**BUILD-PHASES**](docs/BUILD-PHASES.md) — **the working tracker.** Phase-by-phase
  checklist (0→5), dependencies, and definition-of-done.
- [**CHECKLIST**](docs/CHECKLIST.md) — owner action items: decisions + tech debt.

### As-is engineering reference (current codebase)
- [ARCHITECTURE](docs/ARCHITECTURE.md) — current stack, directory map, the RLS /
  admin-client authz model, server-action conventions, cron. **Read first before
  touching code.**
- [GLOSSARY](docs/GLOSSARY.md) — domain language. [DATABASE](docs/DATABASE.md) —
  tables, enums, migrations. [BACKLOG](docs/BACKLOG.md) — hygiene + env vars.
- [ROADMAP](ROADMAP.md) — product feature roadmap (P0–P7).
  [SEO-AEO-PLAN](SEO-AEO-PLAN.md) — discovery layer.

> **As-is vs to-be:** `ARCHITECTURE.md`/`DATABASE.md`/`GLOSSARY.md` describe what
> exists today. The six strategy docs + `BUILD-PHASES.md` describe where we're
> going. They converge as the phases land.

---

## Getting started (developers)

```bash
npm install
npm run dev          # Next.js dev server (Turbopack)  → http://localhost:3000
npx tsc --noEmit     # type check — the project's main correctness gate
npx eslint <paths>   # lint
```

There is **no test framework** in this repo — `tsc` + ESLint + manual
verification are the safety nets. Schema source of truth is
`supabase/migrations/`; see [ARCHITECTURE](docs/ARCHITECTURE.md) for the migration
workflow and the **authorization model you must follow** (the admin client
bypasses RLS — authz is enforced in application code today, converging on RLS +
RPCs per the strategy).

---

## How we work the phases

1. Pick the current phase in [BUILD-PHASES](docs/BUILD-PHASES.md).
2. Each phase lists workstreams as `[ ]` items with a **definition of done** and
   the **strategy doc that governs it**.
3. Update the checkbox state in the same PR that lands the work (the repo file is
   the source of truth — same convention as `ROADMAP.md`).
4. Don't start a phase whose **dependencies** (listed per phase) aren't met.

---

## Proposed Notion structure (user / training side — to build)

Mirror, don't duplicate, the Git docs — translate them into human language:

- **Welcome / What is Frequency** — Circles, Interests, how it grows.
- **Member guide** — joining/finding a Circle, events, the wake-up onboarding,
  earning (gems/zaps), QR/NFC/ghost-node basics.
- **Host guide** — running a Circle, assigning tasks, broadcasts, inline admin.
- **Guide / Mentor / Janitor guides** — escalating leadership/admin training.
- **Partner (business) guide** — directory listing, NFC plaque, offers.
- **Community policy** — moderation, safety (incl. physical-node safety).

*(Ask before scaffolding — needs the target Notion workspace.)*
