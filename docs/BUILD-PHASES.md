# Build Phases — the working tracker

> The executable plan. Each phase has a **goal**, **dependencies** (don't start
> until met), a **governing doc**, **workstreams** as checkboxes, and a
> **definition of done**. Sequenced so the web app keeps working while
> mobile- and gamification-enabling infrastructure accretes — **no big-bang
> rewrite, no mobile code until Phase 5.**
>
> Capstone rationale: [TECH-STRATEGY](TECH-STRATEGY.md). Update checkbox state in
> the PR that lands the work (the repo file is source of truth — same convention
> as [ROADMAP](../ROADMAP.md), which tracks *product features*; this tracks
> *architecture*).

**Status:** `[ ]` pending · `[~]` in progress · `[x]` done

---

## Readiness to rebuild — is the architecture complete?

**Decided (nothing technical blocks Phase 0):**
- Stack: Next.js (web) + Expo/RN (mobile, later) + Supabase, shared TS monorepo.
- Authz boundary: **RLS + `SECURITY DEFINER` RPCs** (client-agnostic).
- Contract: **presentation-neutral RPC view-models** + generated types.
- Composition: **server-composed capability modules** (role + involvement).
- Engagement: **event → verify → ledger → reward** pipeline; PostGIS for geo.
- Layout: one shell, 3 templates (Stream / Index / Detail), capability-driven
  inline actions.

**Still product-side (do NOT block Phases 0–2; decide by Phase 3):**
- Reward economy (point values, earn rules, balancing).
- Physical rollout & safety (who places ghost nodes / partner terms).
- Web's long-term role once mobile leads (full parity vs. lighter funnel).

> Verdict: the **technical architecture is decided and self-consistent** across
> the six strategy docs. Phases 0–2 are pure foundation and can begin now.

---

## Phase 0 — Foundations / seams  ·  *invisible to users*
**Goal:** put the lock-in-resistant seams in place so everything after is local
change, not rewrite. **Depends on:** nothing. **Governs:** SCALE-ARCHITECTURE,
CAPABILITIES-AND-MOBILE.

- [x] Extract shared code into folders (formal Turborepo monorepo deferred to
      mobile, Phase 5): **`lib/core/`** (`roles`, `capabilities`, + the
      `load-capabilities` server seam), **`lib/contract/`** (presentation-neutral
      view-model types), **`lib/tokens/`** (cross-platform token plan).
- [x] Build the **capability resolver** — `lib/core/capabilities.ts`
      (`resolveCapabilities(viewer, scope)`, `can()`), pure + framework-independent;
      plus `lib/core/roles.ts` (single-source `atLeastRole`). tsc clean.
- [~] **Enable PostGIS** — migration `20240214000000_enable_postgis_geography.sql`
      written (extension + generated `circles.geog` + GiST index). **Apply with
      `npx supabase db push`** (needs DB creds/network — not run here).
- [~] **HIERARCHY duplicates consolidated** — admin/broadcast/report actions now
      import `atLeastRole` from `lib/core/roles` (single source). Adopting **RLS +
      RPC** for data access continues in Phase 2.
- [x] Keep raw style values out of components — already enforced (the DAWN token
      system in ARCHITECTURE.md).

**Done when:** new features can be built behind the capability resolver + an RPC,
PostGIS is live (migration applied), and shared folders are importable. No UX
change shipped. **Status: foundations landed; PostGIS apply + HIERARCHY adoption
remain.**

---

## Phase 1 — Web IA & page framework  ·  *user-visible polish*
**Goal:** make the web coherent for newcomers AND exercise the contract/capability
layers mobile will reuse. **Depends on:** Phase 0. **Governs:** IA-STRATEGY,
PAGE-FRAMEWORK.

- [x] Nav grouping — Community / Connect / Progress / Manage sections in
      `app-shell.tsx` (desktop sidebar + mobile drawer); item visibility unchanged.
- [~] Rename member-facing **Channels → Interests** — done on the primary
      surfaces (nav label + `/channels` page heading/description); route +
      `topical_channels` table unchanged. **Follow-up (needs visual QA):** sweep
      any remaining "Channel" copy on cards/`[id]` page, decide the "tune in"
      verb, and reconcile with the public `/discover` layer which says "Topics".
- [x] Demote Hubs & Nexuses from member nav → already absent from the primary
      nav (folded under "Circles" in `isActive`); contextual hub/nexus breadcrumb
      links already render on circle cards. Satisfied.
- [~] In-person **icon designator** (📍 "In person" badge; virtual = unmarked
      default) on the `/circles` cards; capacity line already shows the cap.
      **Follow-up (visual QA):** mirror the badge on the circle detail header.
- [~] **3 templates** — **Detail** shell built
      (`components/templates/detail-template.tsx`: context header + badges +
      actions slot + tabs + body). Stream/Index thin shells + **wiring pages onto
      templates** still pending (needs running app for visual QA).
- [~] **Module + slot + inline actions** — built additively: shared module chrome
      (`components/modules/module-card.tsx`, now consumed by the right rail) +
      capability gating (`components/ui/can.tsx` → `<Can need=…>`). **Still
      pending (needs running app):** the slot registry, scope-aware rail, and
      wiring `getCircleCapabilities`/`getProfileCapabilities` into the circle &
      profile pages so inline admin / edit-in-place render by capability.

**Done when:** every main page renders via one of the 3 templates; inline actions
appear by capability (host edits inline, member sees content only); a newcomer can
read the nav without explanation. **Status:** quick wins landed (nav grouping,
Interests rename, in-person badge, hubs/nexuses demotion); the templates +
inline-admin system is the remaining major slice and is best done with a running
app (visual QA), since it changes page rendering and behavior.

---

## Phase 2 — Authorization convergence  ·  *incremental, behind the scenes*
**Goal:** make the security boundary client-agnostic so mobile can share it.
**Depends on:** Phase 0 (capability resolver). **Governs:** CAPABILITIES-AND-MOBILE.

- [ ] Migrate high-traffic read/write paths from admin-client → RLS + RPCs,
      surface by surface (generalize the `/discover` SECURITY DEFINER model).
- [~] Build the core **view-models** returning **data + capabilities** —
      `getCircleView` + `getProfileView` shipped (`lib/contract/views.ts`,
      reusing the one capability resolver). `getFeed` pending. (Implemented as
      server view-builders now; expose via RPC/endpoint for mobile in Phase 5.)
- [ ] Verify RLS coverage with policy tests for each migrated table.

**Done when:** the primary read paths and key mutations are RLS-enforced and
exposed as typed RPCs that both a web and a (future) mobile client could call
identically.

---

## Phase 3 — Gamification engine + physical-trigger infra  ·  *the differentiator*
**Goal:** one event/reward backbone + the physical layer's data + verification.
**Depends on:** Phase 0 (PostGIS), Phase 2 (RPC contract). **Governs:**
ENGAGEMENT-ARCHITECTURE.

- [x] Generalized **event ledger** — `engagement_events` (migration
      `20240215000000`) + `recordEngagementEvent()` (`lib/engagement/events.ts`):
      append-only, `idempotency_key` = exactly-once, `source`, `verified_at`.
      Runs the EXISTING rules engine on first insert (in front of, not replacing,
      the current gamification system).
- [x] **Verifier** — `verifyCapture()` (`lib/engagement/verify.ts`): server-side
      validity window + signed payload + capture rule + PostGIS proximity
      (`node_within_range` RPC). Idempotency lives in the events layer.
      *Device attestation / mutual-confirm (P2P) still to add.*
- [~] **Reward grant** — reuses the existing idempotent path
      (`recordEngagementEvent` → `processGamificationEvent` → `awardGems`/zaps);
      balances are already maintained columns on `profiles`. Mapping a physical
      capture → a reward event waits on the reward economy (product).
- [~] **Physical nodes / tags** registry — `nodes` + `captures` + RLS
      (migration `20240216000000`); server-mediated (no client reads).
      **`partners/businesses` module schema DONE** — `partners` + `partner_offers`
      + `partner_redemptions` + `nodes.partner_id` (migration `20240218000000`);
      directory/offers public-when-active, redemptions read-own. TS read layer
      DONE (`lib/partners/read.ts`: `listActivePartners` + `getPartnerView`).
      Redemption-on-capture flow (bump plaque → discount + zaps) still to wire.
- [x] **Async lane** — `notification_queue` (migration `20240219000000`) +
      `lib/queue/outbox.ts` (`enqueue` / `processQueue` with retries + exponential
      backoff) + `/api/cron/process-queue` (every 2 min; durable web-push handler
      shipped). *Follow-up: migrate inline send sites (email/push fan-out) onto
      the queue; add `SELECT … FOR UPDATE SKIP LOCKED` claim if concurrency grows.*
- [ ] Realtime **reward feedback** via Supabase Broadcast.
- [x] **Capture orchestration** — `captureNode()` (`lib/engagement/capture.ts`):
      verify → ledger (exactly-once) → capture row → `awardZaps(node.zaps_value)`.
      Physical loop is functional end-to-end. *(Repeatable-node idempotency keying
      still TODO; node reward amounts are tunable via `nodes.zaps_value`.)*

**Done when:** an event from any source can be verified server-side and award
exactly once; QR/NFC/geo nodes exist as data; the engine is config-extensible
(new earn = adapter + rule, not core change). *(Point values/rules deferred.)*

---

## Phase 4 — Scale hardening  ·  *as metrics demand, not before*
**Goal:** remove bottlenecks once they're real. **Depends on:** measured load.
**Governs:** SCALE-ARCHITECTURE §2, ENGAGEMENT-ARCHITECTURE §5.

- [ ] Connection pooling (Supavisor — verify config).
- [ ] Read replicas once reads ≥ ~80% of traffic.
- [ ] Denormalized **feed read-model** + **hybrid fan-out** for high-fan-out
      accounts.
- [ ] **Time-partition** append-only tables (`events`/captures, posts, events,
      notifications).
- [ ] Realtime via **Broadcast** (not Postgres-Changes); shard narrow channels.
- [ ] Add Redis / search (Meilisearch→Elastic) / dedicated vector store **only on
      real signals**.

**Done when:** load tests pass at target scale and each lever was added against a
measured signal (not speculatively).

---

## Phase 5 — Mobile app (Expo / RN)  ·  *the primary doorway*
**Goal:** build mobile on infrastructure the web already proved. **Depends on:**
Phases 0, 2, 3. **Governs:** TECH-STRATEGY, CAPABILITIES-AND-MOBILE.

- [ ] Expo/RN app in the monorepo; consume the **same** RPC contract + capability
      sets + design tokens.
- [ ] Native modules: camera/**QR**, **NFC**, **geofencing**, push.
- [ ] Pilot a Postgres-backed **sync engine (PowerSync)** on one surface (feed or
      gamification) for offline + instant UI — Postgres stays source of truth
      (reversible).
- [ ] Cross-platform push reuses the existing notification-preferences/dispatch
      system.

**Done when:** mobile reaches feature-relevant parity by *assembling* the shared
contract — not reimplementing logic — and is the primary entry point.

---

## Dependency map

```
 0 Foundations ─┬─▶ 1 Web IA/framework
                ├─▶ 2 Authz convergence ─▶ 3 Gamification/physical ─▶ 5 Mobile
                └────────────────────────────────────────────────────▶ 5 Mobile
                                          4 Scale hardening (parallel, metric-driven)
```

Phases 0→1 can run nearly together. 2 enables 3. 3 + 2 enable 5. 4 is continuous,
triggered by measurements, not calendar.
