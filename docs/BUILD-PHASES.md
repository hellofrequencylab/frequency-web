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

> **North Star — Weekly Active Members (WAM):** members with ≥1 *verified
> practice* in a rolling 7 days. **Every phase optimizes for this one number**;
> `practice.verified` is the canonical event. See
> [COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md) §0 + ADR-024.

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
- [x] **Enable PostGIS** — migration `20240214000000` applied to production
      (extension + `circles.geog` + GiST index); used by node proximity + partner geo.
- [~] **HIERARCHY duplicates consolidated** — admin/broadcast/report actions now
      import `atLeastRole` from `lib/core/roles` (single source). Adopting **RLS +
      RPC** for data access continues in Phase 2.
- [x] Keep raw style values out of components — already enforced (the DAWN token
      system in ARCHITECTURE.md).

**Done when:** new features can be built behind the capability resolver + an RPC,
PostGIS is live (migration applied), and shared folders are importable. No UX
change shipped. **Status: DONE** (PostGIS applied to prod; capability resolver +
shared folders in use across the app). Full RLS adoption continues in Phase 2.

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
- [x] In-person **icon designator** (📍 "In person" badge; virtual = unmarked
      default) on `/circles` cards + the circle detail header. Live.
- [x] **3 templates** — all three shells built and the main pages migrated:
      **Stream** (`/feed`), **Index** (`/circles`, `/channels` Interests, `/events`,
      `/partners`, `/people` Directory), **Detail** (`detail-template.tsx`, used by
      single-entity pages). Every primary list/feed page now renders through one
      shell. *(Circle-detail page can adopt the Detail shell in a later pass.)*
- [~] **Module + slot + inline actions** — shared module chrome
      (`components/modules/module-card.tsx`) + capability gating
      (`components/ui/can.tsx`). **Inline admin WIRED + verified live:** the circle
      page gates Host Tools, Circle Health, edit/announce, and feed moderation by
      `circle.editSettings` (host + janitors + area guides/mentors). **Profile
      edit-in-place DONE:** owners edit via settings; janitors get an inline
      moderator edit (name + bio) on any profile, gated by `profile.edit`
      (`moderate-profile-button` + capability-checked `moderateUpdateProfile`).
      **Scope-aware rail DONE:** the global rail shows on global/index pages; entity
      detail pages (circle / profile / interest) render their own scoped rail in the
      page body, and the global rail is suppressed there (no double-sidebar). **Still
      pending:** a formal module **slot registry** (current composition is per-page).

**Done when:** every main page renders via one of the 3 templates; inline actions
appear by capability (host edits inline, member sees content only); a newcomer can
read the nav without explanation. **Status: DONE** (all live) — nav grouping,
Interests rename, in-person badge, 3 templates with pages migrated, inline admin by
capability, profile edit-in-place, scope-aware rail. Only a formal module slot
registry remains as an optional refactor.

---

## Phase 2 — Authorization convergence  ·  *incremental, behind the scenes*
**Goal:** make the security boundary client-agnostic so mobile can share it.
**Depends on:** Phase 0 (capability resolver). **Governs:** CAPABILITIES-AND-MOBILE.

- [ ] Migrate high-traffic read/write paths from admin-client → RLS + RPCs,
      surface by surface (generalize the `/discover` SECURITY DEFINER model).
- [x] Build the core **view-models** returning **data + capabilities** —
      `getCircleView` + `getProfileView` + `getFeed` (cursor-paginated FeedView)
      shipped (`lib/contract/views.ts`), reusing the one capability resolver.
      Implemented as server view-builders now; expose via RPC/endpoint for mobile
      in Phase 5.
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
      directory/offers public-when-active, redemptions read-own. TS read layer +
      **UI live**: `/partners` directory + `/partners/[slug]` detail with offers,
      Partners in nav. **Claim flow live + verified** (`/n/[nodeId]` → verify →
      ledger → zaps). Redemption-on-capture (claim → log `partner_redemptions`)
      still to wire.
- [x] **Async lane** — `notification_queue` (migration `20240219000000`) +
      `lib/queue/outbox.ts` (`enqueue` / `processQueue` with retries + exponential
      backoff) + `/api/cron/process-queue` (every 2 min; durable web-push handler
      shipped). *Follow-up: migrate inline send sites (email/push fan-out) onto
      the queue; add `SELECT … FOR UPDATE SKIP LOCKED` claim if concurrency grows.*
- [x] **Reward feedback** — live "+N zaps" toast (`components/zap-toast.tsx`,
      `showZapToast` + container in the main layout, mirroring achievement-toast)
      fired on event check-in and node claim. *(In-tab CustomEvent; cross-device
      Supabase Broadcast can layer on later if needed.)*
- [x] **Capture orchestration** — `captureNode()` (`lib/engagement/capture.ts`):
      verify → ledger (exactly-once) → capture row → `awardZaps(node.zaps_value)`.
      Physical loop is functional end-to-end. *(Repeatable-node idempotency keying
      still TODO; node reward amounts are tunable via `nodes.zaps_value`.)*
- [~] **`practice.verified`, the North-Star event (ADR-024).** First-class
      `event_type` shipped: server-verified **event check-in** emits it and keys
      zaps + an attendance streak on it. Remaining sources: logged practice +
      verified node check-in. *The practice-retention loop; build it deliberately.*
- [~] **WAM + activation instrumentation** (read-models off `engagement_events`):
      `getPracticeMetrics` (`lib/analytics/practice.ts`) computes Weekly Active
      Members, practices-this-week, and 7-day activation, surfaced on the
      Admin overview. Full analytics dashboards land in Phase 6.5.

**Done when:** an event from any source can be verified server-side and award
exactly once; QR/NFC/geo nodes exist as data; **`practice.verified` flows and WAM
is measurable**; the engine is config-extensible (new earn = adapter + rule, not
core change). *(Point values/rules deferred.)*

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

## Phase 6 — Communications spine, CRM "Studio" & AI agent  ·  *the growth engine*
**Goal:** one notification / CRM / agent layer riding the **one event backbone**,
all optimizing for the WAM North Star. **Depends on:** Phase 3 (backbone — built) +
a **proven practice-retention loop (PMF)** before building the cathedral.
**Governs:** [COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md) (ADR-024…028).

> Build in this order; each step is usable alone. **Do not start the agent (6.6)
> before the test harness exists.** Everything sends through the spine — never inline.

- [~] **6.1 Backbone + spine** — **all email now flows through the outbox**
      (`enqueueEmail` + cron `email` handler; every `lib/email.ts` sender enqueues,
      List-Unsubscribe headers preserved); **`sendInviteEmail` wired** (invite-by-email
      from Host Tools). Remaining: notification **router/registry** (event → category
      → channels → template) + making `engagement_events` a multi-subscriber source.
- [~] **6.2 Deliverability loop** — `email_events` + `email_suppressions` tables
      (migration `20240220000000`); `/api/webhooks/resend` (Svix-verified) logs
      delivery/engagement and **auto-suppresses hard bounces + complaints**;
      `sendRawEmail` checks suppression before every send. Remaining: subdomain
      reputation isolation (SPF/DKIM/DMARC, transactional vs marketing) + surfacing
      open/click analytics. **Owner setup:** add the webhook in the Resend dashboard
      + set `RESEND_WEBHOOK_SECRET`.
- [~] **6.3 CRM data + Studio shell + Contacts** — DONE: `team_members` + `contacts`
      (migration `20240221000000`); `lib/staff.ts requireStaff()` (separate staff
      axis); the `app/(studio)/` shell gated at `/studio`; the Contacts list module;
      **contacts auto-link on signup + backfill of existing members** (trigger +
      migration `20240222000000`). Remaining: compute `engagement_score` (projection
      off the backbone + `email_events`).
- [~] **6.4 Marketing engine** — **Campaigns shipped** (migration `20240223000000`):
      `/studio/campaigns` compose → send to a member segment (all / subscribed)
      through the spine, consent-checked (`shouldSend` lifecycle) + suppression-aware
      + per-recipient unsubscribe. **Automations rules engine shipped** (migration
      `20240224000000`): `/studio/automations` rules subscribe to the event backbone
      (`lib/automations.ts`, called from `recordEngagementEvent`) and act
      (MVP: email the actor, consent-checked). Remaining: richer Segment builder,
      Pipelines (Kanban funnels), conditions/drip sequences, React Email templates,
      lead/non-member unsubscribe.
- [~] **6.5 Analytics** — `/studio/analytics` surfaces the North Star (WAM,
      practices/week, activation, new members), CRM counts (contacts, campaigns,
      suppressed), and email performance + deliverability over 30 days
      (`lib/studio/analytics.ts`). Remaining: funnel conversion, acquisition source,
      cohort retention.
- [~] **Test harness** — **Vitest** (`npm test`; `vitest.config.ts`, `@/` alias).
      **20 tests** covering the pure authz core (`resolveCapabilities`, `atLeastRole`),
      `currencyForSource`, the outbox **retry/backoff policy** (`nextRetry`), the Resend
      **webhook signature verification** (`verifyResendSignature`), and **suppression**
      (`isSuppressed`/`suppress`, mocked client). Still to add before agent *autonomy*:
      a `shouldSend` consent test (the copilot agent is human-gated, so it ships now).
- [~] **6.6 Agent Console (copilot)** — shipped (migration `20240225000000`):
      `/studio/agent` Action Queue, a deterministic winback proposer
      (`lib/studio/agent.ts`), one-click **Approve & send** / Dismiss, and approved
      actions run **through the spine** (consent + suppression + unsubscribe).
      Remaining: swap the deterministic proposer for a live Claude operator + the
      bounded tool surface; per-action-type autonomy + caps/kill-switch/audit
      (needs the spine test coverage first).
- [ ] **6.7 Inbox** — 2-way replies (v2).

**Done when:** every send flows through the spine (none inline); the CRM timeline,
`engagement_score`, and WAM are **projections of the one backbone**; the agent runs
in copilot with guardrails it structurally cannot bypass. *(Deliverability + privacy
non-negotiables: COMMS-CRM-ARCHITECTURE §6.)*

---

## Dependency map

```
 0 Foundations ─┬─▶ 1 Web IA/framework
                ├─▶ 2 Authz convergence ─▶ 3 Gamification/physical ─┬─▶ 5 Mobile
                │                              │ (practice loop/PMF) └─▶ 6 Comms/CRM/Agent
                └──────────────────────────────────────────────────────▶ 5 Mobile
                                          4 Scale hardening (parallel, metric-driven)
```

Phases 0→1 can run nearly together. 2 enables 3. 3 + 2 enable 5. **6 rides 3's event
backbone but waits on a proven practice-retention loop (PMF); its agent step waits on
a test harness.** 4 is continuous, triggered by measurements, not calendar.
