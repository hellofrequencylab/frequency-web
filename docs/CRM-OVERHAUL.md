# CRM Overhaul: one spine, the full Studio

> **Status:** Approved, Phase 0 in progress (2026-06-23).
> **Source of truth (code):** code + `supabase/migrations/`.
>
> This is the unifying plan for Frequency's contact engine. It does **not** restate the
> existing CRM docs; it consolidates them onto one spine and sequences the build of the
> full Studio on top. Decision: ADR-372.

## TL;DR

Frequency already has a working but fragmented contact engine spread across
`network_contacts` (personal book), `contacts` (shared marketing/CRM), the `crm_*`
pipeline tables, the Resonance/connection layer, and `engagement_events`. This overhaul
is a **consolidation, not a rebuild**: unify those parts onto one spine, then build the
full **Studio** (the 12-module embedded CRM / Business OS from
[COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md)) on top of it.

We adopt the **principles** from the approved CRM brief and **discard its schema and tier
names** (they were guesses). The real schema and the real billing axes already exist; the
brief's tiers map cleanly onto them through the existing feature-gate resolver.

| Decision | Call |
|---|---|
| Shape of the work | ✅ Consolidate the existing parts, then build the Studio on top. Not a rebuild. |
| One timeline | ✅ A dedicated `contact_interactions` timeline (one row per touch, every channel), fed by the `engagement_events` backbone. |
| Identity | ✅ Keep three identity tables stitched by email (ADR-130). Never collapse. |
| Tiers | ✅ No new tiers. Map the brief onto the real axes via `lib/pricing/gates.ts`. |
| Upgrade | ✅ An upgrade stays a flag flip, never a migration. |

## 1. The keystone architecture decision

Two structural calls carry the whole plan. Get these right and every phase composes; get
them wrong and the Studio forks into parallel logs again.

### 1.1 One CRM timeline: `contact_interactions`, fed by the `engagement_events` backbone

The CRM needs one chronological record of every touch with a person: `email`, `sms`,
`call`, `in_person`, `event`, `note`, `system`. Reading the code settles *where* it lives.

`engagement_events` (`lib/engagement/events.ts`, `recordEngagementEvent`) is the platform's
append-only **event backbone**: exactly-once via `idempotency_key`, with reward rules firing
on first insert (`processGamificationEvent`) and RLS scoped "read own" to the actor. That is
the right substrate for "something happened that might earn Zaps or trigger a notification",
but it is the wrong home for the timeline: a "sent an email to a contact" row would mis-fire
the reward engine, and its actor-scoped RLS does not model "the owner sees their contacts'
history".

So the timeline is a **dedicated `contact_interactions` table**: one row per touch, scoped
to the owner (and, in the Studio, the Space), with `channel` / `direction` / `summary` /
`body` / `metadata`. It is a **projection, not a parallel log**: the `engagement_events`
backbone feeds it (an adapter writes a timeline row when an event concerns a contact),
alongside the other writers (Resend open/click webhooks, the SMS path, manual notes,
pipeline activity). This keeps [COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md) §1's
"one backbone, many subscribers" intact while keeping the reward ledger and the relationship
history each clean. The existing sources (`email_events`, `crm_activities`, notes) fold in
through the same adapter seam.

### 1.2 Three identity tables, stitched by email, never collapsed

Keep `profiles`, `contacts`, and `network_contacts` as three tables, stitched by lowercased
email (ADR-130), not merged. Collapsing them is RLS-dangerous: a private `network_contact`
("I met this person") must never leak into the member graph or to staff. The
[NETWORK-CRM.md](NETWORK-CRM.md) privacy doctrine ("a capture stays personal/private") is a
hard boundary, not a preference.

"One person, one timeline" is met by a **resolver + read model**
(`lib/crm/person.ts#resolvePerson`, which already groups by email at read time), not a
table merge. The merge is computed on read; the rows stay separated for privacy.

## 2. Tier reconciliation (no new tiers)

The brief invented tier names. We discard them. The real model is three independent axes
already wired through one resolver. The brief's tiers map onto them like this:

| Brief term | Real axis | Where it lives |
|---|---|---|
| Personal billing | `profiles.membership_tier` | `free` (label "Member") / `crew` (paid) / `supporter` |
| Space plan | `spaces.plan` | `free` / `practitioner` / `business` / `organization` / `whitelabel` |
| "Root" | Staff axis: `profiles.web_role` | `admin` / `janitor` |
| "Coaching" | A Space **type**, not a plan | uses the Practitioner stage template |
| "Partner" | A later loyalty phase | Phase 8, not a CRM tier |

All CRM gating flows through `lib/pricing/gates.ts` (`featureAllowed`, the seeded
`space_crm` / `space_email` / `space_automation` / `space_team` / `space_multi_pipeline`
gates), the Space function registry (`lib/spaces/functions.ts` +
`lib/spaces/function-access.ts`), and `resolveCapabilities`
(`lib/core/capabilities.ts`). Because gates are **data, not code branches**, an upgrade
stays a **flag flip**: set the plan, the entitlements expand, the surface unlocks. No
migration, no per-tier schema. See [PRICING.md](PRICING.md) and [ROLES.md](ROLES.md).

## 3. The phased plan

Each phase is usable on its own and reuses what already ships. The legend: ✅ done /
already exists · ⏳ in progress · ⚠️ needs attention · 🔴 blocker. The "Reuses" column is
the consolidation lever: we extend, we do not invent.

### Phase 0, Spine and resolver ⏳

> Goal: stand up the one spine and the one resolver, and start the external A2P clock.

| | Detail |
|---|---|
| Goal | The interaction timeline, the person resolver read model, and one consent surface exist. |
| What we build | CRM capability layer (`lib/crm/capabilities.ts`, ✅ shipped); the `contact_interactions` timeline fed by the `engagement_events` backbone (✅ shipped: migration + `lib/crm/interactions.ts`); the person resolver read model (✅ already exists: `lib/crm/person.ts#resolvePerson`); one contact-level consent surface with a global STOP (✅ shipped: `lib/crm/contact-consent.ts`). |
| Reuses | ✅ `engagement_events` + `recordEngagementEvent` (the backbone) · ✅ `resolvePerson` (ADR-130) · ✅ the consent + suppression lanes (`lib/suppression.ts`, `lib/comms/send-gate.ts`, `sms_consent`). |
| Net-new | The `contact_interactions` table + the write adapter (✅); `lib/crm/capabilities.ts` (✅, ADR-372); `lib/crm/contact-consent.ts` + global STOP (✅). |
| Cross-cutting | 🔴 **Twilio A2P 10DLC registration** — packet ready in [A2P-REGISTRATION.md](A2P-REGISTRATION.md) (a 10 to 15 day external clock; SMS blocked through Phase 5). ⚠️ Blocker found: a live **terms-of-service** page is required for filing and does not exist yet (only `/privacy`). |

### Phase 1, Free personal CRM, consolidated

| | Detail |
|---|---|
| Goal | One contact home with a real timeline, free for every member. |
| What we build | Unified contact detail + timeline UI; Gmail / phone import + dedupe. |
| Reuses | ✅ Manual / QR / OCR capture already ship ([NETWORK-CRM.md](NETWORK-CRM.md)) · ✅ the keep-in-touch layer (reminders, last-contacted, "reach out today") ([CRM-STRATEGY.md](CRM-STRATEGY.md) P1). |
| Net-new | The Gmail / phone importer + dedupe, the timeline view over the Phase 0 spine. |

### Phase 2, Viral loop

| | Detail |
|---|---|
| Goal | Every capture and referral feeds growth, with consent observed. |
| What we build | First-class `referral_links` + `referral_attributions` → Zaps + "X joined" notify + opt-in connect; the Frequency card (QR exists) + NFC + public profile; the card-scan nudge. |
| Reuses | ✅ `/q/<slug>` attributed codes (ADR-091) + `lib/qr/referral.ts` · ✅ `invite_accepted` Zaps (ADR-099) · ✅ the scan-intro email path. |
| Net-new | `referral_links` / `referral_attributions` as first-class rows; NFC; the public profile card. SMS nudge lands post-A2P (Phase 5); email nudge ships now. |

### Phase 3, Member graph

| | Detail |
|---|---|
| Goal | A real people graph with provenance and mutual consent. |
| What we build | Structured provenance on the member graph: `friendships.edge_type` (`met_at_event` / `introduced_by` / `shared_circle` / `opt_in_connect`) + `event_id` / `introduced_by` / `circle_id` FKs (✅ shipped). Mutual opt-in (pending/accepted), introductions, resonance/orbits, near-misses, the connect button all ALREADY existed, not rebuilt. |
| Reuses | ✅ `friendships` mutual opt-in + `introductions` + resonance/orbits/near-misses (the whole connection layer, [CONNECTION-LAYER.md](CONNECTION-LAYER.md)). |
| Net-new | `friendships` provenance columns + `lib/connections/edge-types.ts` (✅ shipped); stamped at connect time + on introduction→friendship. Follow-up: surface "how you connected" in the graph UI. `referral` stays on the CRM axis, not the member graph. |
| Guardrail | ⚠️ Private `network_contacts` are excluded from the graph and from Root. The §1.2 boundary is enforced here. |

### Phase 4, Personal AI (metered)

| | Detail |
|---|---|
| Goal | The personal CRM gets useful, on-doctrine AI, metered on the free tier. |
| What we build | Pre-interaction briefs; context-aware smart reminders (replace fixed intervals); dedup / clean / merge; draft messages. |
| Reuses | ✅ the AI kernel (`getAnthropic`, kill switch, per-feature caps) · ✅ `recordAiUsage` + the `ai_usage` ledger · ✅ Sonnet vision (already wired for OCR). |
| Net-new | The brief / reminder / dedup / draft features; the cap-hit upgrade trigger (free is metered, paid is unlimited). |
| Anti-pattern check | Reminders are **context-aware, never fixed-interval**. AI never auto-sends. |

### Phase 5, Comms rails + first paid bundle

| | Detail |
|---|---|
| Goal | Two-way comms go live and the first paid bundle proves the flag-flip upgrade. |
| What we build | SMS send path live (post-A2P); email tracking → timeline; the **Practitioner** bundle (single pipeline + booking / session history + basic automations). |
| Reuses | ✅ the durable outbox + Resend webhooks (COMMS-CRM §2) · ✅ `crm_*` pipeline + stage templates ([CRM-STRATEGY.md](CRM-STRATEGY.md) P3) · ✅ `space_crm` entitlement. |
| Net-new | The SMS send path, email-open/click write-back to the timeline, the Practitioner bundle. |
| Gate | 🔴 SMS is blocked until A2P clears (clock started Phase 0). |

### Phase 6, The Studio (full)

| | Detail |
|---|---|
| Goal | The full embedded CRM / Business OS on the one spine. |
| What we build | The 12 modules on the spine: Dashboard · Contacts · Pipelines (multi) · Campaigns · Segments · Templates · Inbox · Tasks · Automations builder · Analytics · Settings · Agent Console. |
| Reuses | ✅ the spine, consent, suppression, `notification_preferences`, the Space schema (COMMS-CRM §3) · ✅ `lib/spaces/*` modules already built (campaigns, booking, donations, analytics, audiences). |
| Net-new | The Studio shell + the modules not yet built, mapped to Space plans via entitlements. |
| Mapping | Each module's free / paid line is a per-module entitlement (a tuning knob, §5). |

### Phase 7, Bounded AI agent

| | Detail |
|---|---|
| Goal | An agent that drafts and proposes, never bypasses the guardrails. |
| What we build | The Agent Console: drafts / proposes into an **Action Queue**, acts only through the spine + a bounded tool surface; structural consent / suppression guardrails. |
| Reuses | ✅ the bounded tool surface design (COMMS-CRM §4) · ✅ the spine as the only write path. |
| Net-new | The Agent Console, the Action Queue, per-type autonomy flags. |
| Gate | 🔴 Build the ADR-028 test harness around the spine, consent, and suppression **first**. The agent does not act autonomously before it passes. |

### Phase 8, Root, Partner, migration

| | Detail |
|---|---|
| Goal | Platform-wide operator reach, the Partner loyalty phase, and retiring the Notion CRM. |
| What we build | Root (staff) platform-wide campaigns + the full graph + a collaborator segment; the Partner rewards + funnel; a **one-time** Notion member-CRM seed, folding collaborators as a Root segment, then retire the Notion CRM. |
| Reuses | ✅ the staff axis (`web_role` admin / janitor) · ✅ the graph + segments from earlier phases. |
| Net-new | Root-wide campaign reach, the Partner phase, the one-time Notion import. |
| Anti-pattern check | The Notion seed is **one-time, no two-way sync**. Git stays the source of truth. |

## 4. Cross-cutting tracks

These run across every phase, not inside one.

| Track | Rule |
|---|---|
| A2P clock | 🔴 Start in Phase 0. SMS send (Phase 5) and the SMS card-scan nudge (Phase 2) are blocked until it clears. |
| Naming and voice | Every member-facing string and every AI-generated word passes [NAMING.md](NAMING.md) (terminology) and [CONTENT-VOICE.md](CONTENT-VOICE.md) (voice, no em dashes, §10 checklist). Vera and every draft path read the shared primer in `lib/ai/voice.ts`. |
| Docs protocol | One ADR per phase in [DECISIONS.md](DECISIONS.md); update the relevant `docs/*.md`. Operator-facing changes route to Notion per [DOCS-PROTOCOL.md](DOCS-PROTOCOL.md). |
| Anti-patterns enforced | Config-driven gates only (no per-tier schemas); reminders are context-aware, not fixed-interval; no two-way Notion sync; AI never auto-sends without consent + rate limits; private contacts are never exposed to Root or the graph. |

## 5. Tuning knobs

Editable knobs, not architecture. Set these from operator config as we tune.

| Knob | What it controls |
|---|---|
| Free-tier monthly AI quota | The metered ceiling that triggers the upgrade prompt (Phase 4). |
| Zap value per referral signup | The reward paid when a referred person joins (Phase 2). |
| OCR provider | Sonnet vision is wired today; swappable. |
| Free / paid boundary per Studio module | The per-module entitlement line (Phase 6). |
| Practitioner default pipeline stages | The seed stage template for the first paid bundle (Phase 5). |

## Related docs

- [CRM-STRATEGY.md](CRM-STRATEGY.md), My Contacts (free) → Spaces CRM (paid), the freemium barbell.
- [NETWORK-CRM.md](NETWORK-CRM.md), the capture tool (`network_contacts`, scan / QR / manual).
- [COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md), the comms spine + the 12-module Studio + the agent.
- [CONNECTION-LAYER.md](CONNECTION-LAYER.md), the people graph (Resonance, orbits, Pulse).
- [PRICING.md](PRICING.md), the three-flag billing model + `featureAllowed`.
- [ROLES.md](ROLES.md), the role / entitlement / staff axes + the access matrix.
- [A2P-REGISTRATION.md](A2P-REGISTRATION.md), the Twilio A2P 10DLC brand + campaign filing packet (the SMS long pole).
