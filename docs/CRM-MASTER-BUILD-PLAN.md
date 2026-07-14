# CRM · Messaging · Email · QR — Master Build Plan

> **What this is.** The zoomed-out, fully-phased build plan for Frequency's operator system:
> the modular CRM, the interaction timeline, the email + template engine, funnels/segmentation,
> the subscription center, Vera's intelligence layer, CSV import, and the QR lead-grab engine —
> reconciled against the code that ships today and grounded in 2024–2026 best practice.
>
> It **consolidates and sequences**; it does not restate the subsystem docs. Architecture lives in
> [COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md) · [CRM-OVERHAUL.md](CRM-OVERHAUL.md) ·
> [NEXT-GEN-CRM.md](NEXT-GEN-CRM.md) · [CRM-STRATEGY.md](CRM-STRATEGY.md) ·
> [EMAIL-EDITOR-PLAN.md](EMAIL-EDITOR-PLAN.md) · [EMAIL-CAMPAIGNS-FUNNELS-PLAN.md](EMAIL-CAMPAIGNS-FUNNELS-PLAN.md) ·
> [AI-VERA.md](AI-VERA.md) · and the interaction-tracking reconciliation in
> [CRM-INTERACTION-TRACKING-PLAN.md](CRM-INTERACTION-TRACKING-PLAN.md).
>
> Legend: ✅ built · ⏳ partial / wired-not-surfaced · ⚠️ needs attention · 🔴 net-new.

## 0. The answer up front

Frequency has already built the expensive half of this system: one interaction timeline, a
unified person resolver, three identity tables stitched by email, a real WYSIWYG block email
editor, a durable send queue behind one consent + suppression + preference gate, Resend
webhooks, funnels, nurture drips, an automations engine, and Vera with a governed tool surface
and nightly predictions. **The work ahead is finishing and unifying, not rebuilding.**

One architectural idea organizes everything below: **one person graph, many scoped lenses, a
one-way membrane.** Every CRM — platform, community group, business Space — is the *same* engine
filtered to a scope. This is the proven multi-tenant pattern (shared identity plane + sealed
per-tenant data planes; the Slack model), and it is already the grain of the codebase. Making
"scope" the single spine that interaction tracking, stats, comms, segmentation, import, and lead
capture all read through is the through-line of this plan.

The plan is **9 phases**. Phase 0 hardens the spine; Phases 1–8 each deliver one owner-visible
capability and are independently shippable.

---

## 1. The organizing architecture — the membrane model

### 1.1 Two planes (best practice: shared identity + sealed tenant data)

| Plane | What | Scope | In code today |
|---|---|---|---|
| **Person spine** (global) | One canonical human, resolved by lowercased email; identity + platform membership | Cross-scope, shared | `profiles` + `resolvePerson` (ADR-130) ✅ |
| **Scope overlay** (sealed) | A scope's private view of a person: notes, tags, custom fields, deal stage, and its own interaction history | Per Space / group / owner, RLS-sealed | `contacts.space_id`, `network_contacts.owner_id`, `client_notes`, `crm_deals` ✅ |

A CRM = **the person spine, filtered to who belongs in a scope, plus that scope's overlay.** One
person → many sealed overlays. Resolution unifies the *graph*; it never widens *visibility*
(research: Segment Unify, ReBAC/Zanzibar). The card is assembled **viewer-relative** at read time
— global fields + the viewer's own scope slice — never one "full" object filtered on the client.

### 1.2 The three CRM tiers

| Tier | Population | Owner | Private uploads? |
|---|---|---|---|
| **Platform (root)** | All members (`profiles`) | Frequency / staff | No |
| **Place-tree** (Circle · Hub · Nexus) | Members who belong to the scope | Host / Guide / Mentor | No |
| **Space (business)** | Sealed uploaded/captured contacts **∪** connected members | The Space (tenant) | **Yes** |

### 1.3 The three membrane laws (the invariant)

1. **Down-spill:** a member who belongs to a scope appears in that scope's CRM automatically
   (`contacts.profile_id` set). No upload, no consent step.
2. **Up-seal:** a Space's uploaded contact (`space_id` set, `profile_id` null,
   `consent_state='unknown'`) is invisible to the platform, to other Spaces, and to the graph.
   It is the business's list, not Frequency's (ADR-099 privacy doctrine).
3. **Join is the only bridge, identity-only:** when a sealed contact joins Frequency (email
   match), the spine stitches, the sealed contact **links** to the new profile (never copied),
   and prior activity retro-attributes. The Space keeps its private overlay; the platform gains a
   member but inherits **no** private data. **Consent never transfers** upward or sideways.

### 1.4 Enforcement (best practice, mostly already followed)

- **RLS is the outer guard, entitlements the inner.** `tenant_id`/`space_id` RLS makes cross-scope
  reads *impossible*; ReBAC/role checks decide *which fields/actions* a viewer gets within what
  they can read. Belt and suspenders.
- **RLS hardening:** `FORCE ROW LEVEL SECURITY`, policies `TO authenticated`, `WITH CHECK` on
  writes, `auth.*()` wrapped in `(select …)` initplans (ADR-365, already the repo pattern), every
  policy column indexed. App role never `BYPASSRLS`.
- **Consent modeled per `(person × scope × purpose × channel)`**, append-only, with the versioned
  notice text — not a boolean on the person. Membership grants no marketing consent.

---

## 2. The full system map — every element

Grouped into eleven subsystems. Status is the honest current state from the code scan.

> ✅ **Shipped update (2026-07-14):** the 🔴/⏳ items below that belong to Phases 1–7 are now built
> (see the phase table + ADR-610…616). The per-element glyphs record the pre-build scan; the phase
> table in §3 is the authoritative shipped status. Only Phase 8 (SMS/A2P) remains.

### A. Identity & scope
✅ Three identity tables stitched by email · ✅ `resolvePerson` read model · ✅ `space_id` scoping ·
✅ graduation (personal → Space). ⏳ Viewer-relative assembly is implicit, not a named primitive.
🔴 CI guard that every scoped table has RLS forced.

### B. Interaction timeline (asks 1, 3)
✅ `contact_interactions` (append-only, polymorphic subject, owner+Space scoped, idempotent) ·
✅ writers for campaign email, Resend open/click, network capture, scan-invite · ⏳ SMS send-only +
A2P-gated · 🔴 **in-app messages / DMs have no adapter** · 🔴 inbound email · 🔴 manual "log a
call/meeting" · 🔴 **the system/human toggle** (the `source` field exists; no UI switch).
*Best practice:* single polymorphic events table + first-class `source`/`is_system` dimension,
filter don't delete.

### C. Engagement stats & scoring (asks 2, 7)
✅ `member_engagement_scores` matview (Resonance Health, churn, activation) on member detail ·
⏳ `contacts.engagement_score` is a dark scalar · 🔴 **per-contact sent/opened/replied rollup** ·
🔴 per-segment engagement health. *Best practice:* denormalized read models off the immutable log.

### D. Email & template engine (asks 5, 6, 9)
✅ Real WYSIWYG block editor · ✅ branded `emailDocumentShell` + 7 presets · ✅ merge tags (4 vars) ·
✅ campaign send state machine + per-Space sending · 🔴 **product/offering block + search-by-owner
picker** (offerings block is explicitly excluded from email today) · 🔴 product merge variables ·
⏳ transactional email still hardcoded strings (not editor-managed) · ⚠️ marketing/transactional
subdomain split deferred. *Best practice:* locked brand shell + approved dynamic blocks; data-bound
product cards; MJML/React-Email-grade render (your inline-table renderer already meets this).

### E. Messaging & broadcast (asks 8, 10)
✅ In-app DMs + rooms · ✅ Dispatches (place-tree broadcast) + event dispatches · ⏳ SMS path built
but A2P-gated · 🔴 **broadcasts persist no recipient log** · 🔴 **unified "who-got-what" control
panel** (ledgers exist: `contact_interactions` + `outreach_sends` + `email_events` +
`notification_queue`, unassembled).

### F. Funnels, segmentation & automations (ask 8)
✅ Growth-OS funnel object + rollup · ✅ per-persona nurture drips (cron) · ✅ automations rules
engine (trigger→condition→action) · ✅ trait segments + per-Space audiences · ⚠️ **place-tree and
contact-segment targeting cannot cross** (no way to email "a circle") · ⏳ advanced facets
(engagementDepth/resonanceTier/churnRisk) stored but inert · ⏳ Vera funnel drafting is a
placeholder. *Best practice:* dynamic rule-based segments; lifecycle stages; goal-exit sequences.

### G. Subscription center & consent (ask 11)
✅ 4×3 preference grid (dispatches/events/mentions/lifecycle × email/inapp/push) · ✅ consent ledger
+ scopes · ✅ HMAC unsubscribe + RFC 8058 one-click + suppression · 🔴 **no topics** (comments,
marketing) · 🔴 no frequency selector · 🔴 no per-circle/per-Space topic toggles · 🔴 consent scopes
(marketing/ai_memory/analytics) have no UI · 🔴 non-member contacts have no preference row.
*Best practice:* granular topic + frequency, transactional carved out, real-time sync, per-tenant.

### H. Vera / AI layer (ask 4)
✅ Bounded governed tool surface (propose-and-confirm) · ✅ nightly `refresh-traits` predictions ·
✅ Vera Today (5-card move-list, pull-only) · ✅ member memory + voice primer · 🔴 **no scheduled
owner daily brief** · ⏳ `send_playbook_email`/`send_intro_email` draft-only (real send is "a later
phase") · ⏳ general turn loop still deterministic. *Best practice:* draft-and-approve, never
auto-send; scheduled digests need a real cron trigger.

### I. CSV import & data onboarding (import asks)
🔴 **No CSV contact import today.** ✅ Precedents to reuse: the business-importer staging+status
pattern (`business_intake`), Google-contacts import with email/phone dedupe, `details`/`meta` jsonb
for custom fields, `coerceExtraction` for AI-structured-then-validated shapes. *Best practice:*
staged pipeline (parse→map→validate→preview→commit), layered auto-map (normalize→synonyms→fuzzy→
value-inference→confidence gate), LLM fallback on low-confidence columns (sample not whole file,
structured output constrained to the schema, human approves), target-schema + passthrough custom
fields, upsert dedupe with dry-run diff, row-level partial import (never reject the file).

### J. QR lead-grabs & attribution (lead-grab asks)
✅ `/q/<slug>` codes (connect/referral/event/circle) · ✅ `captureQrContact` one-way capture +
met-context · ✅ attribution capture (UTM + first-touch + referral) carried through deferred signup ·
✅ entry-point/`entry_campaigns` · 🔴 **Space-scoped lead-grab** (scan a business code → sealed Space
lead) · 🔴 **capture-now-claim-on-join** redemption into a Space CRM with immutable entry point ·
🔴 the 5 grab front doors. *Best practice:* dynamic per-campaign QR, immutable first-touch
"entry point" set once and never overwritten, append-only touchpoint log, double-opt-in sharing,
consent-native lead magnets (download ≠ marketing consent).

### K. Deliverability, compliance & governance (cross-cutting)
✅ Dedicated `send.` subdomain · ✅ RFC 8058 one-click unsubscribe · ✅ hard-bounce/complaint
auto-suppression · ✅ global suppression checked before every send · ✅ 95 KB size guard · ✅ durable
outbox + dead-letter operator surface · ⚠️ marketing/transactional subdomain split deferred ·
⚠️ complaint-rate monitoring (< 0.1%, never breach 0.3%) not surfaced as a tracked metric ·
🔴 SMS A2P 10DLC registration (external 10–15 day clock; a live ToS page is a prerequisite).

---

## 3. The phased build plan

Each phase is independently shippable, additive, RLS-consistent (owner/Space read, service-role
write), and rides the one send-gate. Migration head is `20261157000000`; new migrations start
`20261158000000`. Effort is rough engineer-weeks. Every member-facing string and AI-generated word
passes [NAMING.md](NAMING.md) + [CONTENT-VOICE.md](CONTENT-VOICE.md).

| Phase | Goal | Owner ask | Nature | Status | Depends on |
|---|---|---|---|---|---|
| **0** | Harden the spine (membrane made explicit) | the modular model | Hardening + guards | ✅ shipped | — |
| **1** | Complete the contact card (timeline + toggle + stats) | 1, 2, 3, 7 | Wiring + 1 migration | ✅ shipped (ADR-610) | 0 |
| **2** | CSV import & data onboarding | import | New | ✅ shipped (ADR-611) | 0 |
| **3** | QR lead-grabs & attribution | lead grabs | Wiring + new | ✅ shipped (ADR-612) | 0, (1) |
| **4** | Email engine completion (product blocks + transactional) | 5, 6, 9 | New block + wiring | ✅ shipped (ADR-613; transactional seam deferred) | — |
| **5** | Unified segments + messaging control panel | 8, 10 | Wiring + new UI | ✅ shipped (ADR-614) | 1 |
| **6** | Subscription preference center | 11 | New UI + migration | ✅ shipped (ADR-615) | 0 |
| **7** | Vera intelligence (owner brief + send graduation) | 4 | Wiring + cron | ✅ shipped (ADR-616) | 1, 5 |
| **8** | SMS activation | text tracking | External + wiring | 🔴 deferred (A2P clock) | 1, A2P |

Phases 1–7 shipped on branch `claude/crm-interaction-tracking-scan-y9xsx8` (2026-07-14); Phase 8
(SMS/A2P 10DLC) is the remaining deferred item, gated on the external registration clock.

Phase 0 → 1 are sequential (the spine, then the card over it). Phases 2, 3, 4, 6 can run in
parallel after 0. Phases 5 and 7 follow 1. Phase 8 is gated on the external A2P clock (start it now).

### Phase 0 — Harden the spine ✅ shipped
> ✅ Shipped: membrane laws documented as invariants; scoped-table RLS guards in place.

**Deliverables:** a CI guard asserting every scoped table has `FORCE ROW LEVEL SECURITY` + a
`space_id`/owner policy; audit policies for `TO authenticated` + `WITH CHECK` + `(select …)`
initplans; name **viewer-relative card assembly** as a single read helper (global person + the
viewer's scope overlay); confirm the consent model is keyed per `(person × scope × purpose ×
channel)`; document the three membrane laws as enforced invariants. **Nature:** mostly hardening
what already exists. **ADR:** membrane invariants + RLS guard.

### Phase 1 — Complete the contact card ✅ shipped
> ✅ Shipped (ADR-610, migration `20261158000000`): `in_app` channel + DM adapter, manual "log a
> touch", the system/human toggle, and the per-contact `contact_engagement_stats` rollup.

**Deliverables:** widen `contact_interactions.channel` to add `in_app` (migration `20261158…`);
**Adapter A** in-app messages/DMs → timeline (fire-safe, idempotent on message id); **Adapter B**
inbound email; **Adapter C** manual "log a call/meeting/note" writing `contact_interactions`
natively; the **system/human toggle** on every timeline (filters on `source`, never deletes,
default: hide automated on the personal card); a `contact_engagement_stats` rollup (sent/opened/
clicked/replied, last-touch, recency) refreshed nightly; wire the real `engagement_score`
projection. **Delivers:** full interaction tracking + activity/engagement stats + the focus toggle.
**Reuses:** `recordContactInteraction`, `buildTimeline`, `email_events`, the trait cron. **ADR:**
timeline channel widening + engagement rollup.

### Phase 2 — CSV import & data onboarding ✅ shipped
> ✅ Shipped (ADR-611, migration `20261159000000`): the staged parse → map → validate → preview →
> commit pipeline, smart auto-map + AI-assist, custom-field registry, dedupe, and the scoped target.
> Surfaces: `/admin/marketing/import` (Space) + `/connections/import` (member).

**Deliverables:** a `contact_import` staging record (jsonb, mirrors `business_intake`); the
**pipeline** `parse → map → validate → preview → commit`; **smart auto-map** (`lib/crm/import/map.ts`:
header-normalize → synonym dict → fuzzy → value/type inference → confidence gate); **AI-assist**
Vera tool `propose_import_mapping` (sample rows only, structured output constrained to the schema,
human approves; reuses the `coerceExtraction` doctrine); **custom-field registry** (per owner/Space
known keys + type) with target-schema + passthrough into `details`/`meta` jsonb; **dedupe/merge**
(normalized email → last-10 phone, reusing `existingContactKeys`; skip/overwrite/fill-empty;
dry-run diff; idempotent upsert); **row-level partial import** with inline-fixable errors; **scoped
target** (member → `network_contacts`; Space → `contacts(space_id)` sealed by Law 2). Add Papa Parse
(client parse for instant headers/sample; AI + commit server-side for privacy). **Delivers:** upload
ANY CSV, map or auto-create fields, preview the formatted list before commit. **ADR:** import
pipeline + custom-field registry.

### Phase 3 — QR lead-grabs & attribution ✅ shipped
> ✅ Shipped (ADR-612, migration `20261160000000`): the capture-now-claim-on-join engine, the
> immutable entry point (`lead_entry_points`, DB-enforced), the Space QR lead-grab (full) with the
> other four doors as engine hooks, and the Space CRM leads surface.

**Deliverables:** the **capture-now-claim-on-join** engine — a scan/capture writes a sealed Space
lead + an **immutable entry-point** (`attribution` first-touch + a `contact_interaction` with
`metadata.entry_point` + `contacts.meta.acquisition`; set once, never overwritten) + an append-only
touchpoint log; **claim redemption** on signup (deterministic email/phone match links the sealed
lead to the new profile, retro-attributes, surfaces in the Space CRM as a member with the original
door). The **five front doors:** (1) Space QR lead-grab with offer-unlock + staff attribution;
(2) vouched warm intro (member→Space, Space↔Space partner share, double-opt-in); (3) event/attendance
capture with tier→lifecycle-stage; (4) consent-native lead magnet (capture = opt-in); (5) reciprocal
"share back" exchange. **Bonus:** platform-brokered resonance intro (opt-in down-spill). **Consent:**
capture ≠ marketing consent; only offer/magnet/accepted-intro grabs make a lead mailable. **Reuses:**
`/q/<slug>`, `captureQrContact`, `lib/attribution/*`, deferred-auth signup. **ADR:** lead-grab engine
+ entry-point immutability.

### Phase 4 — Email engine completion ✅ shipped (transactional seam deferred)
> ✅ Shipped (ADR-613, no migration): the data-bound `productCard` email block, the search-by-owner
> product picker, and product merge variables. ⏳ The transactional-template seam is deferred on
> purpose for a client-boundary reason (`lib/email.ts` must not reach the `server-only` product-block);
> the marketing/transactional subdomain split (GE6-5) stays separately deferred.

**Deliverables:** a data-bound **`productCard` email block** (add to `EMAIL_PALETTE_BLOCK_IDS`;
renderer in `lib/email-studio/render.ts`; resolves image/title/price/CTA at send time so it never
goes stale); a **search-by-owner product picker** in the editor over the existing-but-unused commerce
queries (`listMyMakerProducts`, `listSpaceCatalog`, `productOwnerProfileId`); **product merge
variables** with fallbacks; make **transactional templates editor-managed** (migrate the hardcoded
`emailShell` strings onto the block-tree + preset system so all in-house email is WYSIWYG-editable);
begin the **marketing/transactional subdomain split**; surface **complaint-rate** on the
deliverability console. **Delivers:** products/offerings in a content box + user→product search +
every in-house email editable. **Builds on:** [EMAIL-EDITOR-PLAN.md](EMAIL-EDITOR-PLAN.md) Card-grid
work (the product card is its data-bound sibling). **ADR:** product email block + transactional
templating.

### Phase 5 — Unified segments + messaging control panel ✅ shipped
> ✅ Shipped (ADR-614, migration `20261162000000`): unified segments (place-tree `circle:`/`hub:`/
> `nexus:` ∪ trait/contact), activated advanced facets, the control panel at
> `/admin/marketing/messaging/control-panel`, and the broadcast recipient log (`dispatch_recipients`).
> Bug fix: Dispatch email fan-out now routes through `resolveSendGate` (suppression + consent).

**Deliverables:** extend the audience resolver (`lib/spaces/audiences.ts`, `resolveSegment`) to accept
**place-tree selectors** (`circle:/hub:/nexus:` → memberships → profiles → contacts) unioned with the
trait-segment grammar — **one audience type, both worlds**; activate the **stubbed advanced facets**
by joining `member_traits`; the **messaging control panel** at `/admin/marketing/messaging` composing
`contact_interactions` + `outreach_sends` + `email_events` + `notification_queue` into "what's going /
went to whom"; **add a recipient log to broadcast fan-out** (`createAndPublishDispatch` persists none
today) so Dispatches appear too; fold in the guided funnel console
([EMAIL-CAMPAIGNS-FUNNELS-PLAN.md](EMAIL-CAMPAIGNS-FUNNELS-PLAN.md)). **Delivers:** message any circle/
hub/nexus/segment + a control panel of who-gets-what. Every recipient still routes through
`resolveSendGate`. **ADR:** unified audience + dispatch recipient log.

### Phase 6 — Subscription preference center ✅ shipped
> ✅ Shipped (ADR-615, migration `20261161000000`): topics (comments + marketing) + frequency,
> per-circle/per-Space mutes, the consent-scope UI, contact-keyed preferences, and the
> preference-center landing on the per-Space unsubscribe token. Transactional stays carved out.

**Deliverables:** expand the model from the fixed 4×3 grid to **topic + frequency** (add `comments`,
`marketing`; real-time / daily-digest / weekly-digest selector); **per-circle / per-Space topic
toggles** modeled as `(subject, topic, channel, state)`; surface the existing **consent scopes**
(marketing/ai_memory/analytics) in settings; a **contact-keyed** `contact_channel_preferences`
surface + a preference-center landing on the per-Space unsubscribe token so a non-member can opt down
a topic instead of hard-unsubscribing; keep **transactional carved out** in code + UI. **Delivers:**
members and contacts choose exactly what they receive. **ADR:** granular preference model + contact
preferences.

### Phase 7 — Vera intelligence layer ✅ shipped
> ✅ Shipped (ADR-616, no migration): the daily owner-brief cron (`vera-owner-brief`, read + compose
> only, gated + frequency-capped) and human-approved (non-autonomous) send graduation. The
> defaults-off invariant holds: every send-capable path ships OFF and needs a human one-tap.

**Deliverables:** a **daily owner-brief cron** (`vera-owner-brief`, after `refresh-traits`) that runs
`buildTodayCards()` per operator/Space and sends the 5 moves via the gate + outbox (frequency-capped,
`withVoice`-drafted, never auto-acts) — turning Today from pull-only into the push the owner asked
for; **graduate `send_playbook_email`/`send_intro_email`** from draft-only to human-approved real send
through the send-gate; next-best-action on the contact card; per-scope engagement scoring. **Delivers:**
the smart CRM that scans daily and keeps the owner updated. **Gate:** the ADR-028 spine/consent/
suppression test harness before any autonomy graduation. **ADR:** owner brief + send graduation.

### Phase 8 — SMS activation 🔴 deferred (remaining item)
> 🔴 Deferred: the only remaining phase. Gated on the external Twilio A2P 10DLC registration clock
> (10–15 days) and a live Terms-of-Service page. The SMS send path is built + gated; nothing ships
> until A2P clears.

**Deliverables:** complete **Twilio A2P 10DLC** registration (external clock — **start now**; a live
Terms-of-Service page is a prerequisite and does not exist yet); set provisioning env; light the SMS
send path (already built + gated); confirm SMS touches write to the timeline (Adapter already exists
at `lib/queue/handlers.ts`). **Delivers:** text tracking + SMS as a first-class channel. **Gate:**
blocked until A2P clears.

---

## 4. Data model additions

Every addition is additive, RLS-consistent, and registry-declared where it is a trait.

| Migration (new) | What | Scope / RLS | Phase |
|---|---|---|---|
| `*_interaction_channel_in_app.sql` | widen `contact_interactions.channel` CHECK (+ `in_app`) | — | 1 |
| `*_contact_engagement_stats.sql` | rollup (owner, subject_kind, subject_id → sent/opened/clicked/replied, last-touch) | owner/Space read, service write | 1 |
| `*_contact_import.sql` | `contact_import` staging (raw rows + mapping + validation + status jsonb) | owner/Space scoped | 2 |
| `*_custom_field_registry.sql` | per owner/Space known custom-field keys + inferred type | owner/Space scoped | 2 |
| `*_lead_entry_points.sql` | immutable entry-point + append-only touchpoint log on capture | Space-sealed | 3 |
| `*_contact_channel_preferences.sql` | `(subject, topic, channel, state)` incl. contact-keyed + per-circle | subject/owner scoped | 6 |
| (existing) `playbooks` / `playbook_runs`, `sms_consent`, `funnels` | already migrated; some await apply/regen-types | — | 7, 8 |

Registry additions where traits: reuse `member_traits` facets for the advanced audience join (Phase 5);
add engagement-rollup as a computed read model (Phase 1).

---

## 5. Cross-cutting tracks

| Track | Rule |
|---|---|
| **A2P clock** | 🔴 Start Phase 8 registration **now** (10–15 day external clock). Ship a live Terms-of-Service page first (only `/privacy` exists). SMS send + SMS lead nudges are blocked until it clears. |
| **Deliverability** | Marketing/transactional subdomain split (Phase 4) before high marketing volume; complaint rate held < 0.1% (never breach 0.3%), surfaced on the deliverability console. |
| **Naming & voice** | Every member-facing string + AI word passes NAMING + CONTENT-VOICE (no em dashes, skeptic test, §10). Nouns: Contacts, Email, Automations, Vera, Dispatches, Resonance Engine. |
| **Governance / AI** | Bounded typed tools; consent + suppression + frequency caps structural; draft-and-approve, never auto-send; kill switch + usage caps; the ADR-028 test harness before any autonomy graduation. |
| **Privacy** | The three membrane laws are hard invariants. Sealed contacts never reach Root or the graph. Consent never inherits upward or sideways. GDPR: erase-this-scope's-contact vs erase-person-globally are distinct; tombstone erased identifiers. |
| **Docs** | One ADR per phase in [DECISIONS.md](DECISIONS.md); update the subsystem doc; operator-facing changes route to Notion per [DOCS-PROTOCOL.md](DOCS-PROTOCOL.md). |

---

## 6. Success metrics

Measured first-party off `engagement_events` + `contact_interactions`, never GA4.

| Metric | Definition | Signal |
|---|---|---|
| **Timeline completeness** | % of a contact's real touches that appear on the card | Rising toward 100% as adapters land |
| **Import activation** | contacts brought in per operator via CSV + the abandon rate at each pipeline stage | High completion, low abandon at map/preview |
| **Lead-grab conversion** | sealed leads → claimed-on-signup, by entry-point door | Which doors actually convert |
| **Segment send health** | per-segment open/click/complaint before + after send | Complaint < 0.1%; opens rising |
| **Preference retention** | topic opt-down rate vs global unsubscribe rate | Opt-down >> unsubscribe (the center works) |
| **Owner brief action rate** | operators acting on the daily 5 within 24–72h | High, sustained |
| **Membrane integrity** | cross-scope leakage incidents; RLS-guard CI pass rate | Zero leakage; 100% guarded |

Anti-metrics we do **not** lead with: total contacts imported, cumulative emails sent, raw scan
counts — they only go up and answer no operator question.

## 7. References

- Reconciliation + subsystem detail: [CRM-INTERACTION-TRACKING-PLAN.md](CRM-INTERACTION-TRACKING-PLAN.md)
- Architecture: COMMS-CRM-ARCHITECTURE · CRM-OVERHAUL · NEXT-GEN-CRM · CRM-STRATEGY ·
  EMAIL-EDITOR-PLAN · EMAIL-CAMPAIGNS-FUNNELS-PLAN · AI-VERA · NETWORK-CRM · CONNECTION-LAYER
- Code spine: `lib/crm/*` · `lib/email-studio/*` · `lib/comms/send-gate.ts` · `lib/spaces/audiences.ts` ·
  `lib/attribution/*` · `lib/connections/*` · `lib/ai/vera/*` · `lib/commerce/products.ts` · `vercel.json`
- Best-practice basis (2024–2026): polymorphic activity timeline (Activity Schema, Customer.io);
  Gmail/Yahoo bulk-sender rules + RFC 8058; granular preference centers; MJML/React-Email + block
  builders; dynamic segments + lifecycle funnels; multi-tenant RLS + shared identity graph (Segment
  Unify, Zanzibar/ReBAC); data-onboarding pipelines (Flatfile/OneSchema); first-touch/immutable
  entry-point attribution + double-opt-in sharing + consent-native capture.
