# Communications, CRM & AI-Agent Architecture

> Governs **Phase 6** in [BUILD-PHASES.md](BUILD-PHASES.md). Sits on top of the
> engagement backbone in [ENGAGEMENT-ARCHITECTURE.md](ENGAGEMENT-ARCHITECTURE.md) —
> it does **not** replace it. Decisions here are recorded as ADR-024…028 in
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
(`enqueue`/`processQueue`, retries + exponential backoff) + `/api/cron/process-queue`
(push handler only today). `shouldSend(profileId, channel, category)` gates 4
categories × 3 channels; HMAC unsubscribe + RFC 8058 one-click already wired;
provider is Resend (`lib/email.ts`).

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

## 3. The "Studio" — embedded CRM / Business OS

An admin-gated cockpit reusing the nested-route-group framework with its own
SaaS-style shell (not member chrome): route group `app/(studio)/` mounted at
`/studio`, gated once at `(studio)/layout.tsx`.

**12 modules:** Dashboard · Contacts (CRM) · Pipelines · Campaigns · Automations
(drip + trigger→condition→action rules engine) · Segments · Templates (React Email +
brand kit) · Inbox (2-way, v2) · Tasks · Agent Console · Analytics · Settings.

**Two settled data decisions:**
- **Separate staff/team roles** — a `team_members` table (owner/admin/marketer/
  analyst), distinct from community roles, gated via `lib/staff.ts`
  `requireStaff(role)`. A community moderator ≠ a business operator. (Modeled as a
  second authz axis alongside the community capability resolver — not a fork.)
- **Unified `contacts` table linked to `profiles`** — lowercased email is the
  unique join key; one row for everyone (leads/customers/members); `profile_id`
  nullable, auto-linked on signup so CRM history carries onto the member.
  `engagement_score` is a **projection** off the one event backbone + `email_events`.

The Studio reuses the spine, `notification_preferences`, unsubscribe tokens, and the
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
notification preferences + unsubscribe, **the durable outbox (push only)**, 5
transactional emails, **and (this build) the `engagement_events` backbone +
verifier + capture + partners**. `sendInviteEmail` is defined but never called
(circle invites make a link but don't email it — a quick win).

**Design-only (this doc):** `practice.verified` + WAM instrumentation, the
notification router/registry, email-on-the-queue, Resend webhooks + `email_events` +
suppression, the contacts/CRM layer, the Studio, the rules engine, the AI agent.
