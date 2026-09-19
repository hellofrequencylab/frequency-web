# Frequency

A platform for **place-based, in-person community practice** — local **Circles**
that gather around shared **Interests**, growing into neighborhood **Hubs** and
area **Nexuses**, with a gamified, physical-world engagement layer (QR / NFC /
geolocation). **Mobile-first** (the app is the primary doorway; the web is the
secondary surface and the SEO/discovery front).

Current build: **Next.js 16** (App Router / RSC) + **Supabase** (Postgres, Auth,
Realtime, Storage) on Vercel, **Tailwind v4**.

---

## Where documentation lives: three homes, by audience

| Home | Audience | Contains |
|---|---|---|
| **GitHub** (`/docs`, `AGENTS.md`, this README) | **Developers** | architecture, schema, conventions, the build plan, everything technical |
| **Public help center** (`content/help/`, served at `/help`) | **Members** | how to use the product, in member language |
| **Notion** | **Operators, hosts, training** | how to operate/moderate the product, host/admin guides, community policy |

**Rule of thumb:** if it tells a *developer how to build it*, it goes in Git; if it
tells a *member how to use it*, it goes in the help center; if it tells an *operator how
to run or moderate it*, it goes in Notion. One change updates each home in its own voice:
we single-source the routing, not the prose. Full spec:
[docs/DOCS-PROTOCOL.md](docs/DOCS-PROTOCOL.md) and [docs/HELP-CENTER.md](docs/HELP-CENTER.md).

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

### Which plan is live (read this before anything else)

The repo carries years of planning documents, and several of them describe themselves as the
single source of truth. The live set is short, and [AGENTS.md](AGENTS.md) §"Which plan is live"
is its authority; this section mirrors it:

| Question | Where the answer lives |
|---|---|
| **Where does the work stand?** | [`docs/BUILD-BACKLOG.json`](docs/BUILD-BACKLOG.json) — the ONE list. Run **`pnpm backlog`** for the working view. Status never lives in prose ([ADR-1043](docs/DECISIONS.md)). |
| **What ships next?** | [UX-MATURITY-PLAN](docs/UX-MATURITY-PLAN.md) (ADR-925; its §Sequencing table) + [BUILD-LIST](docs/BUILD-LIST.md) (ADR-921; the phase runway, including the parked phases). |
| **Why was it decided?** | [DECISIONS](docs/DECISIONS.md) — the ADR record. A plan doc that contradicts an ADR is stale, not authoritative. |
| **The editor, blocks, block registry** | [EDITOR-ARCHITECTURE](docs/EDITOR-ARCHITECTURE.md) (ADR-974…978), phases E0–E10. Read it before touching any of them. |

The locked canons, each machine-enforced or gated: [NAMING](docs/NAMING.md) +
[CONTENT-VOICE](docs/CONTENT-VOICE.md) (every word a human reads),
[PAGE-FRAMEWORK](docs/PAGE-FRAMEWORK.md) (one shell, eight page shells, one chrome map),
[STUDIO](docs/STUDIO.md) (creation wizards derive from a manifest),
[MENU-CONTRACT](docs/MENU-CONTRACT.md) (the admin menu derives from four catalogs), and
[DEPLOY-SAFETY](docs/DEPLOY-SAFETY.md) (merging `main` deploys to production; the artifact gates).

Everything below this line is context. `DEVELOPMENT-MAP`, `BUILD-SEQUENCE`, `BUILD-PHASES`,
`ROADMAP`, `CHECKLIST` and `BACKLOG` are **history** with superseded banners: worth reading for
rationale, never for status. **When the code and a doc disagree, the code wins**, and the doc gets
fixed in the same pass.

### Strategy & target architecture (the frame — read in this order)
0. [PLATFORM-VISION](docs/PLATFORM-VISION.md): **the whole-system frame** (the *why*). One
   community graph spanning a nonprofit (Foundation) + for-profit (Labs), one shared game,
   money hard-partitioned by entity, verticals (Programs/Marketplace/Collective/affiliate/
   donations/Lab Spaces) as
   modules, the geographic flywheel. Governs ADR-029→036. Read this first for the *why*.
1. [IA-STRATEGY](docs/IA-STRATEGY.md) — information architecture: Circle + Interest
   as the only member-facing words; Hubs/Nexuses contextual; in-person designator;
   role + milestone "wake-up" gating. (Labs/demand-proving are out of website scope.)
2. [PAGE-FRAMEWORK](docs/PAGE-FRAMEWORK.md) — one shell, eight page shells
   (Stream / Index / Detail / Dashboard / Focus / WizardShell / RailGrid / Admin, §8),
   composable modules + slots, and the on-page operator **Settings panel** (ADR-180/182).
   *(Reads "widget" = module card UI — see its terminology note.)*
3. [SCALE-ARCHITECTURE](docs/SCALE-ARCHITECTURE.md) — the 5-layer lock-in-resistant
   model, RSC/PPR rendering, Postgres scaling seams, future-proofing.
4. [CAPABILITIES-AND-MOBILE](docs/CAPABILITIES-AND-MOBILE.md) — one capability
   resolver powering inline admin + cross-platform parity; why authz converges on
   RLS + RPCs.
5. [ENGAGEMENT-ARCHITECTURE](docs/ENGAGEMENT-ARCHITECTURE.md) — the event →
   verify → ledger → reward backbone hosting all gamification sources.
6. [TECH-STRATEGY](docs/TECH-STRATEGY.md) — the capstone: recommended stack,
   decisions made, and the phased plan.
7. [COMMS-CRM-ARCHITECTURE](docs/COMMS-CRM-ARCHITECTURE.md) — the **WAM North Star**,
   the one event backbone, the comms spine, the CRM "Studio", and the AI agent. Its
   "Phase 6" frame is history; the live CRM docs are
   [CRM-MASTER-BUILD-PLAN](docs/CRM-MASTER-BUILD-PLAN.md) + [CRM-COMMS-CONTRACT](docs/CRM-COMMS-CONTRACT.md).

### Executable plan
- [`docs/BUILD-BACKLOG.json`](docs/BUILD-BACKLOG.json) + **`pnpm backlog`** — **where the work
  stands.** Every row states how it is proven; `pnpm check:backlog` runs the probes and fails both
  ways (a stale `open` row and a regressed `done` row).
- [**UX-MATURITY-PLAN**](docs/UX-MATURITY-PLAN.md) — **what ships next.** Eight lifts, each with
  its gate and its number; the §Sequencing table is the order.
- [**BUILD-LIST**](docs/BUILD-LIST.md) — **the phase runway** around it, including the phases the
  owner has deliberately parked. Its rows defer status to the backlog.
- [**OVERVIEW**](docs/OVERVIEW.md) — **north star.** The whole picture: IA,
  page framework, gamification, and the lock-in-resistant architecture.
- [**START-HERE**](docs/START-HERE.md) — **new-developer orientation.** Run it locally,
  what to read in order, and how to ship a change. Open this first.
- [BUILD-PHASES](docs/BUILD-PHASES.md), [CHECKLIST](docs/CHECKLIST.md),
  [DEVELOPMENT-MAP](docs/DEVELOPMENT-MAP.md), [BUILD-SEQUENCE](docs/BUILD-SEQUENCE.md) — **history.**
  Each carries a superseded banner; read for items no current plan absorbed, never for status.

### As-is engineering reference (current codebase)
- [ARCHITECTURE](docs/ARCHITECTURE.md) — current stack, directory map, the RLS /
  admin-client authz model, server-action conventions, cron. **Read first before
  touching code.**
- [GLOSSARY](docs/GLOSSARY.md) — domain language (names themselves are locked in
  [NAMING](docs/NAMING.md)). [DATABASE](docs/DATABASE.md) — tables, enums, migrations.
  [BACKLOG](docs/BACKLOG.md) — the 2026-06 hygiene + env-var list, superseded (banner at top).
- [DESIGN-LANGUAGE](docs/DESIGN-LANGUAGE.md) — the design language and page-flow blueprint on
  the DAWN tokens; [THEME-PROTOCOL](docs/THEME-PROTOCOL.md) — the theming operating manual.
  [DESIGN](docs/DESIGN.md) is the original warm-editorial brief, kept for history.
- [DECISIONS](docs/DECISIONS.md) — architecture decision records (ADRs).
  [DOCS-PROTOCOL](docs/DOCS-PROTOCOL.md) — how docs are routed (**technical → git,
  instructional → Notion**). Follow it on every change.
- [BASELINE-ASSESSMENT](docs/BASELINE-ASSESSMENT.md) — the 2026-06 senior systems review
  (front-end/theming, role-based admin, security, code health, data architecture) and the
  cleanup roadmap it proposed (ADR-246). History: read it for the diagnosis, never for status.
- [ROADMAP](ROADMAP.md) — the original product feature roadmap (P0–P7), superseded.
  [SEO-AEO-PLAN](SEO-AEO-PLAN.md) — discovery layer.

> **As-is vs to-be:** `ARCHITECTURE.md`/`DATABASE.md`/`GLOSSARY.md` describe what
> exists today (`pnpm check:arch-doc` holds `ARCHITECTURE.md` to the tree). The strategy docs
> describe where we're going; `BUILD-BACKLOG.json` records how far along it is.

---

## Getting started (developers)

**Prerequisites:** Node 20+ and **pnpm 10.33.0** — pinned via the `packageManager`
field, so let corepack manage it (don't `npm i -g pnpm`).

```bash
corepack enable                  # use the exact pnpm version this repo pins
pnpm install
pnpm approve-builds              # first time only: allow sharp + unrs-resolver to build
cp .env.example .env.local       # then fill in the values below
pnpm dev                         # Next.js dev server (Turbopack) → http://localhost:3000
```

**Environment variables (`.env.local`).** `vercel env pull` does *not* help here —
the Vercel vars are marked **Sensitive**, so they pull back blank. Fill these by hand
(the minimum to boot the app):

| Var | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → **publishable** key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → **secret** key (server-only) |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |

Feature keys (Stripe, Resend, AI, KV/Redis, VAPID) only matter when you exercise those
features — leave them blank otherwise.

**Quality gates** (run before you push):

```bash
pnpm exec tsc --noEmit   # the project's main correctness gate
pnpm lint
pnpm test                # Vitest unit suite (repo-wide co-located *.test.ts)
pnpm check:authz         # authz contract gate (admin-client guards)
```

Tests are a repo-wide unit suite of co-located `*.test.ts` files (under `test/` and
alongside the code they cover in `app/`, `components/`, and `lib/` — capabilities,
currency, the outbox queue, suppression, webhook verification, and more). They
complement, not replace, `tsc --noEmit` + ESLint + `pnpm check:authz` + manual
verification. Schema source
of truth is `supabase/migrations/`; see [ARCHITECTURE](docs/ARCHITECTURE.md) for the
**authorization model you must follow** (the admin client bypasses RLS — authz is
enforced in application code today, converging on RLS + RPCs per the strategy).

### Shipping a change

`main` is **protected** — every change goes through a pull request (you cannot push to
`main` directly).

```bash
git checkout main && git pull
git checkout -b feature/your-change
# ...edit, run pnpm dev + the gates, commit...
git push -u origin feature/your-change
```

Open a PR → Vercel builds a **preview URL** → CI + preview must be green → **merge
deploys to production**. The full workflow (local + on-the-go, and the path to a
team-grade setup) lives in [docs/WORKFLOW.md](docs/WORKFLOW.md).

> ⚠️ **One shared database (for now).** Local, preview, and production all point at the
> same Supabase project. Develop freely, but **never run destructive or migration
> commands against it** — in particular, do **not** run `supabase db push` until the
> migration baseline is established. See
> [WORKFLOW.md → Scaling to a team](docs/WORKFLOW.md#scaling-to-a-team).

---

## How we work the plan

1. Start at `pnpm backlog` ([`docs/BUILD-BACKLOG.json`](docs/BUILD-BACKLOG.json)) for where we
   are and what is built; take the ordered "what to build next" from
   [UX-MATURITY-PLAN](docs/UX-MATURITY-PLAN.md) §Sequencing and [BUILD-LIST](docs/BUILD-LIST.md).
   (`DEVELOPMENT-MAP.md`, `BUILD-SEQUENCE.md` and `BUILD-PHASES.md` are superseded history.)
2. Each backlog row states **how it will be proven** (its probe) and the **doc that governs it**
   (`source.file`). A probe measures the consequence, never the row's own title.
3. Close the row in the same PR that lands the work by making its probe pass — never by editing
   prose and never by deleting the probe ([ADR-1043](docs/DECISIONS.md)). Re-test a row's
   premise before working it; premises expire.
4. Don't start work whose **dependencies** aren't met, and record any decision as an ADR in
   [DECISIONS](docs/DECISIONS.md).

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
