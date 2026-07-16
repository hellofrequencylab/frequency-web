# Communications, CRM & AI-Agent Architecture

> Governs **Phase 6** in [BUILD-PHASES.md](BUILD-PHASES.md). Sits on top of the
> engagement backbone in [ENGAGEMENT-ARCHITECTURE.md](ENGAGEMENT-ARCHITECTURE.md).
> It does **not** replace it. Decisions here are recorded as ADR-024…028 in
> [DECISIONS.md](DECISIONS.md).

## 0. North Star — Weekly Active Members (WAM)

The one number every layer optimizes for: **members completing ≥1 *verified
practice* (check-in, attended session, logged practice) in a rolling 7 days.**
Depth is secondary (sessions/member, practice-streak retention).

- **Hero event:** `practice.verified` — the canonical highest-value event.
- **Gamification rewards verified practice far above social activity** (zaps +
  streaks key on real-world practice, not scrolling) — so reward and mission are
  the same act. (Refines the gem/zap split: gems = web/social, zaps = verified
  practice + in-person/outreach; practice is the top of the zap hierarchy.)
- **Activation leading indicator:** *first verified practice within N days of
  joining* — instrument this first; it predicts retention best.
- **Analytics hero metric is WAM; "retention" means practice retention.**
- **The AI agent optimizes for getting people to practice / winning back lapsed
  practice** — not lapsed email opens.
- **Counter-metric:** watch practice repeat/quality, not raw check-in counts, so
  "verified" stays honest.

## 1. The keystone — ONE event backbone, many projections

Three things are secretly the same and must **never** become three parallel logs:
the loyalty/gamification ledger, the notification spine's trigger source, and the
CRM activity timeline. They unify into **one append-only event stream** that
gamification, notifications, the CRM timeline, analytics, and the agent all
**subscribe to** (one source of truth, many projections).

**Already built (this is the keystone, and it exists):** `engagement_events`
(`lib/engagement/events.ts`, `recordEngagementEvent`) — append-only, exactly-once
via `idempotency_key`, source-tagged. Phase 6 makes it multi-subscriber and adds
`practice.verified` as a first-class `event_type`.

## 2. The spine (communications/sending)

**Built:** durable outbox — `notification_queue` + `lib/queue/outbox.ts`
(`enqueue`/`processQueue`, retries + exponential backoff, terminal dead-letter
state with `requeueDeadLettered()`/`countDeadLettered()` recovery + visibility,
ADR-043) + `/api/cron/process-queue` (push + email + sms handlers). The **dead-letter
queue now has an operator surface** (GE6-1): `/admin/marketing/deliverability` shows the
live pending backlog (`countPending`), the dead-letters grouped by kind
(`summarizeDeadLettered`/`listDeadLettered`), and one-tap recovery (the `requeueDeadLetters`
server action, re-gated to marketing staff, calls `requeueDeadLettered`). This closes the
DLQ gap: exhausted side-effects are visible and recoverable without inspecting the table by
hand. The Resend webhook
(`app/api/webhooks/resend/route.ts`) has an explicit error path: it suppresses
independently of analytics logging and returns 503-to-retry (logged) vs 200-ack so
delivery-integrity signals are never silently dropped. `shouldSend(profileId,
channel, category)` gates 4 categories × 3 channels; HMAC unsubscribe + RFC 8058
one-click already wired; provider is Resend (`lib/email.ts`).

**Target:** one **notification router/registry** — `domain event → registry (event
→ category → channels → template) → per-recipient checks (preferences + consent +
suppression + idempotency dedupe + batching) → enqueue per (recipient × channel) →
outbox drains → Resend → Resend webhook (delivered/open/click/bounce/complaint)
→ writes back to auto-suppress + logs `email_events` for analytics.`

**Seven principles:** (1) everything queued, never inline; (2) one
dispatcher+registry kills per-site duplication; (3) idempotency everywhere;
(4) consent + suppression as a hard central layer; (5) batch noisy social events
(fatigue = deliverability risk); (6) webhooks close the loop; (7) templates move
to React Email components.

**Reputation isolation:** separate sending subdomains for transactional vs
marketing, each with its own SPF/DKIM/DMARC.

**Email lanes:** L1 Account/transactional (bypass marketing consent, honor hard
bounces only) · L2 Funnel/lifecycle (requires marketing consent) · L3 Social/product
(in-app first, batch the noisy) · L4 Community/engagement & moderation.

**Two consent surfaces, scoped:** `contacts.consent_state` governs marketing/funnel
(L2); `notification_preferences` governs product notifications (L3–4); a global
**suppressions** list overrides everything. Marketing requires double opt-in.

## 3. The CRM cockpit — embedded CRM / Business OS

An admin-gated cockpit for the operator, distinct from member chrome.

**How it actually shipped (2026-07):** *not* as a standalone `app/(studio)/` route
group mounted at `/studio` with its own SaaS-style shell. That shell was never built.
The cockpit landed as **two admin surfaces under the existing admin chrome**, both
gated via `requireAdmin`:
- **Resonance CRM** at `/admin/crm` (`app/(main)/admin/crm/`) — Members/Contacts,
  Pipeline, Deals, the Resonance Graph, Playbooks, Vera Today, and the intelligence
  cockpit.
- **Marketing** at `/admin/marketing` (`app/(main)/admin/marketing/`,
  `layout.tsx` gated once) — Campaigns, Automations (drip + trigger→condition→action
  rules engine), Segments/audiences, Nurture drips, the Messaging control panel,
  Deliverability, Analytics, and the Agent console.

Between them these cover the originally-scoped modules (Dashboard · Contacts ·
Pipelines · Campaigns · Automations · Segments · Templates · Agent Console · Analytics
· Settings); Inbox (2-way) and Tasks remain unbuilt. There is **no** `/studio` shell,
route group, or `(studio)/layout.tsx`.

**Two settled data decisions (both shipped):**
- **Separate staff/team roles** — a `team_members` table (owner/admin/marketer/
  analyst), distinct from community roles, gated via `lib/staff.ts`
  `requireStaff(role)`. A community moderator ≠ a business operator. (Modeled as a
  second authz axis alongside the community capability resolver — not a fork.)
- **Unified `contacts` table linked to `profiles`** — lowercased email is the
  unique join key; one row for everyone (leads/customers/members); `profile_id`
  nullable, auto-linked on signup so CRM history carries onto the member.
  `engagement_score` is a **projection** off the one event backbone + `email_events`.

These surfaces reuse the spine, `notification_preferences`, unsubscribe tokens, and the
community schema — a new presentation + CRM-data layer, **not a rewrite**.

## 4. The AI agent — on rails, not in charge

An embedded Claude operator keeping funnels + community health alive with minimal
staff. It acts **only** through the spine and a bounded tool surface (`query_contacts`,
`get_pipeline_health`, `draft_message`, `enqueue_send`, `move_stage`, `create_task`,
`propose_rule`, `flag_for_human`) — so consent/suppression/frequency caps are
**structural guardrails it cannot bypass.**

- **Copilot-first:** drafts/proposes into an Action Queue; a human one-click approves.
  Safe action-types graduate to autonomous per-type as the audit log earns it
  (copilot↔autopilot is an approval-flag gate, not a rewrite).
- **Scope:** marketing *and* community-health (dying circles, at-risk members,
  emergent leaders, host assistance).
- **Governance:** autonomy tiers, hard frequency + spend/volume caps, dry-run, kill
  switch, full audit log with rationale.

## 5. Build sequence (each step usable alone; see Phase 6)

1. **Event backbone + spine** — make `engagement_events` multi-subscriber + add
   `practice.verified`; migrate **all email onto the outbox**; idempotency. *(Backbone
   + outbox already built.)*
2. **Webhooks + suppression + `email_events`** — close the deliverability loop.
3. **CRM data + Studio shell + Contacts module.**
4. **Segments + Templates → Campaigns → Pipelines → Automations/rules engine.**
5. **Analytics** (funnel, acquisition, email performance, deliverability, cohort).
6. **Agent Console** (copilot).
7. **Inbox** (2-way, v2).

## 6. Non-negotiables

- **One event backbone** — gamification, notifications, and CRM never invent their
  own event log.
- **Add a real test harness** around the spine, consent, and suppression **before**
  the agent acts autonomously. (Vitest is in: `npm test` covers the pure authz core
  + currency routing; spine/consent/suppression tests with mocks still to add.)
- **Deliverability is production-critical** — subdomain reputation isolation +
  monitoring; one incident can poison member email.
- **Privacy/trust is existential** — health + emotional + location data: data
  minimization, strict member control, the agent never surfaces PII it shouldn't.
- **Sequence with discipline** — prove the **practice-retention loop (PMF)** before
  building the cathedral on top.

## 7. Ground truth (built vs design-only)

**Built:** community/hierarchy schema, gamification, events (recurrence + reminders),
dispatches, DMs, friendships, moderation, presence, web push, weekly digest,
notification preferences + unsubscribe, **the durable outbox (push + email + sms)**, 5
transactional emails, **the `engagement_events` backbone + verifier + capture +
partners**, and **(Engine 6 core) the automations rules engine with a condition layer,
saved-segment broadcasts, and the dead-letter operator surface** (see below).
`sendInviteEmail` is defined but never called (circle invites make a link but don't email
it — a quick win).

**Engine 6 core (GE6-1/2/3, shipped):**
- **Automations rules engine** (`lib/automations.ts`): a subscriber on the event backbone.
  Each rule is `trigger_event → conditions → action`. The **condition layer** (`eq`/`neq`/
  `exists`/`absent`/`gt`/`lt` over the event's `context` jsonb, dot-paths supported) lives
  inside `action_config.conditions` (migration-free) and is a pure, exhaustively-tested
  gate (`evaluateConditions`); no conditions = always fire (back-compatible). Actions
  `email_actor` (through `resolveSendGate`) and `push_actor` (through the outbox) both enqueue,
  never send inline. Admin editor at `/admin/marketing/automations` (create / edit / delete /
  toggle), each mutation re-gated to marketing staff server-side.
- **Segment broadcasts** (`/admin/marketing/campaigns`): compose to a saved `segments`
  audience (`seg:<slug>`) or a built-in audience, with a pre-send **audience-size preview**
  (`previewBroadcast`). Each recipient routes through the **unified `resolveSendGate`**
  (suppression + consent + preference), then the outbox.
- **DLQ hardening** (`/admin/marketing/deliverability`): pending backlog + dead-letters by
  kind + one-tap requeue.

**CRM · Messaging · Email · QR build (Phases 1–7, shipped 2026-07-14, ADR-610…616):** the contact
timeline is now complete — `in_app` channel + DM adapter, manual "log a touch", the system/human
toggle (read-time filter), and a per-contact `contact_engagement_stats` rollup (Phase 1). Staged CSV
import (Phase 2), the QR capture-now-claim-on-join lead engine with an immutable entry point
(Phase 3), the data-bound `productCard` email block + search-by-owner picker (Phase 4), unified
segments (place-tree ∪ trait/contact) + the `/admin/marketing/messaging/control-panel` +
`dispatch_recipients` log (Phase 5), the granular subscription preference center (Phase 6), and
Vera's daily owner-brief cron + human-approved send graduation (Phase 7) all ship. The Dispatch email
fan-out now routes through `resolveSendGate` (suppression + consent) — closing a path that bypassed
the one gate. **Send graduation is defaults-off:** every send-capable Vera path ships OFF and needs a
human one-tap. This partly discharges the GE6-4 autonomy work below (human-approved, non-autonomous).

**Deferred (Engine 6, follow-on):** GE6-4 Vera agent *autonomous* graduation + circuit breaker
(send graduation shipped human-approved per ADR-616; per-type auto-send is still unbuilt), and GE6-5
React-Email component templates + the marketing/transactional sending-subdomain split. The
transactional-template editable seam is also deferred at the `lib/email.ts` client boundary (ADR-613).
SMS/A2P (Phase 8) is the remaining deferred CRM item.

**Shipped since this doc's original scope:** email-on-the-queue (the durable outbox),
Resend webhooks + `email_events` + suppression (§2), the contacts/CRM layer, the CRM
cockpit (shipped as `/admin/crm` + `/admin/marketing`, **not** the `/studio` shell
this doc first sketched — see §3), the automations rules engine (GE6 core), and Vera
(the AI agent, human-approved / non-autonomous per the deferred note above).

**Still design-only (this doc):** `practice.verified` + WAM instrumentation, and the
full notification router/registry.
