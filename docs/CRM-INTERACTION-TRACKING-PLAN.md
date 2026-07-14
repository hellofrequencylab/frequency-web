# The Owner's CRM: full interaction tracking + the comms system, reconciled

> **What this is.** A deep scan of the CRM, email, funnel, and subscription systems against
> the owner's vision for a "super slick CRM with full tracking of every interaction," plus a
> sequenced build to close the gap. It **consolidates**, it does not restate: the architecture
> lives in [COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md), [CRM-OVERHAUL.md](CRM-OVERHAUL.md),
> [NEXT-GEN-CRM.md](NEXT-GEN-CRM.md), [CRM-STRATEGY.md](CRM-STRATEGY.md),
> [EMAIL-EDITOR-PLAN.md](EMAIL-EDITOR-PLAN.md), [EMAIL-CAMPAIGNS-FUNNELS-PLAN.md](EMAIL-CAMPAIGNS-FUNNELS-PLAN.md),
> and [AI-VERA.md](AI-VERA.md). This doc is the owner-facing reconciliation + the punch list.
> Legend: ✅ built · ⏳ partial/wired-not-surfaced · ⚠️ needs attention · 🔴 not built.

## The answer up front

> ✅ **Shipped (2026-07-14, branch `claude/crm-interaction-tracking-scan-y9xsx8`).** All five gaps
> below are now closed. Moves 1–6 shipped as CRM Master Build Plan Phases 1–7 (ADR-610…616). The
> ask-by-ask table and the moves keep their original scan text for the record; each move carries a
> ✅ shipped note. Only SMS/A2P (Phase 8) remains deferred.

**You have already built roughly 70% of the system you described.** The spine that most
platforms never get right is done: one append-only timeline (`contact_interactions`), a
unified person resolver, a real WYSIWYG block email editor, a durable send queue with a
single consent + suppression + preference gate, Resend webhooks that write opens/clicks back
onto the timeline, a funnel object, per-persona nurture drips, an automations rules engine,
and Vera with a governed tool surface and a nightly prediction refresh.

The vision is not blocked by architecture. It is blocked by **five specific, mostly-additive
gaps** where the pipes exist but the last connector is missing:

1. **In-house messages + inbound replies never reach the timeline** — the one thing that makes
   the contact card feel complete is the one channel with no adapter.
2. **The system/human toggle does not exist** — the timeline has a `source` field but no UI
   switch to hide automated noise.
3. **Products/offerings cannot be inserted into an email** — the block is explicitly dropped
   from the email palette; there is no product picker and no search-by-owner.
4. **The subscription preference center is a fixed 4×3 grid** — no per-topic (comments,
   marketing, per-circle) choices, and the marketing/AI-memory consent scopes have no UI.
5. **There is no owner daily digest and no "who-got-what" control panel** — Vera Today is a
   pull-only staff page; broadcast fan-out persists no recipient log.

Everything else the owner asked for is a wiring or surfacing task on top of what ships. Below:
the ask-by-ask reality check, then the five builds sequenced, each grounded in the code and in
2026 deliverability/CRM best practice.

---

## 1. Ask-by-ask reality check

| # | The owner's ask | State | Where it lives / what's missing |
|---|---|---|---|
| 1 | Contact card shows **every interaction** (email, text, in-house) | ⏳ | `contact_interactions` + `buildTimeline` render email (send + open/click) and captures. **SMS is send-only + A2P-gated; in-app DMs and inbound email have no adapter.** |
| 2 | See a person's **activity + engagement stats** | ⏳ | `member_engagement_scores` matview (Resonance Health, churn, activation) is surfaced on member detail. `contacts.engagement_score` is a dark scalar; **no per-contact sent/opened/replied rollup.** |
| 3 | **Toggle system engagement on/off** (focus email + text) | 🔴 | The timeline row carries `source` (`manual`/`engagement`/`resend`/`system`/…) and `channel`, but there is **no UI toggle** to filter automated events out. Cheap to add. |
| 4 | **Smart CRM Vera** does a daily scan + keeps the owner updated | ⏳ | `refresh-traits` cron recomputes predictions nightly; `Vera Today` ranks the 5 moves. **But Today is pull-only — no cron emails/pushes a daily owner brief.** |
| 5 | Email fully tied to a **full template editor** + a standard Frequency template | ✅ | Real WYSIWYG (`email-canvas-editor.tsx`), block trees in `email_templates`, the branded `emailDocumentShell` + 7 seeded presets. Transactional mail still uses legacy string templates (not editor-managed). |
| 6 | **Products/offerings** insertable into a content box; **search by user** to auto-fill | 🔴 | The `offerings` block is **explicitly excluded from the email palette** and dropped at render. Commerce has the queries (`listMakerProducts`, `listSpaceCatalog`, `productOwnerProfileId`) but **email imports none of them.** |
| 7 | **Stats** | ⏳ | Per-campaign metrics (`getCampaignMetrics`), funnel rollup, deliverability console all exist. Per-contact + per-segment engagement rollups are the gap. |
| 8 | **Funnel/segmentation** — message circles, hubs, nexuses, or any segment | ⚠️ | Two worlds that don't cross: **place-tree** targeting (circle/hub/nexus) drives Dispatches; **contact-segment** targeting drives Email campaigns. You cannot email "a circle." |
| 9 | All **in-house emails** get an editable template + WYSIWYG | ⏳ | Marketing/campaign email is WYSIWYG. **Transactional/system emails are hardcoded strings** (`emailShell` in `lib/email.ts`), not editor-managed. |
| 10 | **Control panel** to see what messages go to what people | 🔴 | Pieces exist (`contact_interactions`, `outreach_sends`, `email_events`, `notification_queue`) but are not assembled into one operator view. Broadcasts persist **no recipient log at all.** |
| 11 | **Subscription channels** — choose what you receive (per message, comment, marketing) | ⏳ | A `notification_preferences` 4×3 grid (dispatches/events/mentions/lifecycle × email/inapp/push) exists. **No comments/marketing/per-circle topics; consent scopes have no UI.** |

**Read:** four rows are 🔴/⚠️ (the real work), five are ⏳ (surfacing/wiring), two are ✅. The
"tight and clean" instinct is right — this is finishing a system, not building one.

---

## 2. The load-bearing decision: one timeline, three missing adapters

The whole "slick CRM" experience rests on the contact card showing a complete, trustworthy
history. The table for that already exists and is correctly shaped
(`contact_interactions`, ADR-372): one append-only row per touch, polymorphic subject across
`contacts` / `network_contacts` / `profiles`, owner- and Space-scoped, idempotent, with
`channel` + `direction` + `source` + `metadata`. Best practice (HubSpot, Attio, Customer.io,
the warehouse "Activity Schema") is exactly this: **one polymorphic actor–verb–object events
table with a JSONB payload and a first-class `source`/`is_system` dimension**, not per-channel
tables. We are on the right model.

What is missing is **coverage**. Confirmed writers today: campaign email send, Resend
open/click webhook, SMS send (gated off), network capture, scan-intro email. Missing writers:

- **In-app messages / DMs** — the `channel` CHECK has no `in_app` value; no adapter folds
  `messages` / `notifications`. This is the single biggest miss for "every in-house message."
- **Inbound email** — only outbound + engagement events are captured; replies never appear.
- **Manual "log a call / meeting / note"** — `call`/`in_person` channels exist but no UI writes
  them natively (staff notes go to `crm_activities`, folded only at read time).

**Do not invent a second log.** Widen the channel vocabulary, add the three adapters, and keep
the read-time fold as the migration bridge. This is the keystone of everything below.

---

## 3. The build — five moves, sequenced

Highest-leverage, lowest-risk first. Each move is independently shippable and reuses the spine.
Migration head is `20261157000000`; new migrations start `20261158000000`.

### Move 1 — Complete the timeline + the system/human toggle (asks 1, 3) ✅ shipped
> ✅ Shipped as Phase 1 (ADR-610, migration `20261158000000`): `in_app` channel + DM adapter, the
> manual "log a touch", and the system/human toggle (read-time filter, never deletes).

**Why first.** It is the contact card. Until in-house messages and the toggle land, the card
under-delivers the core promise.

**Build:**
- Widen `contact_interactions.channel` to add `in_app` (and reserve `dm`); one small migration
  altering the CHECK constraint. (`lib/crm/interactions.ts` `CHANNELS` + `InteractionChannel`.)
- **Adapter A — in-app messages:** on `sendMessage` (`app/(main)/messages/actions.ts`) and room
  messages, fire-safe `recordContactInteraction({ channel: 'in_app', direction, source: 'system' })`
  keyed to the counterpart's subject. Idempotent on message id.
- **Adapter B — inbound email:** add a Resend inbound route (or reply-to parse) that writes an
  `email` / `inbound` row. Deliverability best practice keeps this on the marketing subdomain's
  reply-to; low priority vs A.
- **Adapter C — manual log:** a "Log a call / meeting / note" affordance on the contact detail
  that writes `contact_interactions` natively (`source: 'manual'`), replacing the read-time
  `crm_activities` fold over time.
- **The toggle:** a persistent "Show automated events" switch on every timeline
  (`buildTimeline` / the detail components). It filters on `source` — `engagement`/`system`
  hidden, `manual`/human-channel shown — **never deletes**. This is the owner's "focus on email
  and text" control, one boolean over a field we already store. Default: system events hidden
  for the owner's personal card, shown in the staff console.

**Best practice honored:** append-only log + read-time filtering (never destructive); a
first-class source dimension is exactly how Customer.io separates "things people did" from
message-lifecycle metadata.

### Move 2 — Per-contact + per-segment engagement stats (asks 2, 7) ✅ shipped
> ✅ Shipped as part of Phase 1 (ADR-610): the `contact_engagement_stats` rollup and the wired
> `engagement_score` projection.

**Build:**
- A `contact_engagement_stats` rollup (table or matview) keyed `(owner_profile_id, subject_kind,
  subject_id)` holding: sent / delivered / opened / clicked / replied counts, open-rate,
  last-touch, last-open, recency band. Derivable from `contact_interactions` + `email_events`;
  refreshed on the nightly cron beside `refresh-traits`.
- **Finally wire `contacts.engagement_score`** as the documented projection off the backbone +
  `email_events` (open BACKLOG item) so the "Engagement" StatCard stops showing a dark value.
- Surface the rollup on the contact card's stat row (reuse `StatCard`), and add a
  **per-segment** rollup so a segment shows aggregate open/click/reply health before a send.

**Best practice honored:** separate the immutable event log from denormalized read models;
engagement scoring that feeds at-risk segments is the 2026 CRM standard.

### Move 3 — Products/offerings in email + search-by-owner (ask 6) ✅ shipped
> ✅ Shipped as Phase 4 (ADR-613, no migration): the data-bound `productCard` block, the
> search-by-owner picker, and product merge variables. The transactional-template seam is deferred
> for a client-boundary reason (see ADR-613).

**This is the most contained net-new feature and a clear owner priority.**

**Build:**
- A new **`productCard` email block** (add to `EMAIL_PALETTE_BLOCK_IDS` in
  `lib/entity-blocks/registry.ts`; renderer in `lib/email-studio/render.ts`). Fields: product
  ref (owner + product id), with image / title / price / CTA resolved **at send time** so the
  card never goes stale — a data-bound dynamic block, the recommended pattern.
- A **picker** in the email editor: search a person/owner (reuse `searchContacts` / profile
  search), then list **their** products via the commerce queries that already exist and are
  currently unused by email — `listMyMakerProducts(profileId)`, `listSpaceCatalog(spaceId)`,
  `productOwnerProfileId`. Pick one → inserts a `productCard`. This is the owner's "search by a
  user to find what products and offerings they have, automatically."
- Add product/offering **merge variables** (`{{product.title}}`, `{{product.price}}`,
  `{{product.url}}`) to `MERGE_TAG_VARIABLES` with fallbacks.

**Note:** the block builds on the [EMAIL-EDITOR-PLAN.md](EMAIL-EDITOR-PLAN.md) Card-grid work
(images + stat boxes) — the product card is a data-bound sibling of that block, not a parallel path.

### Move 4 — One segment audience across the place-tree + contacts (ask 8) ✅ shipped
> ✅ Shipped as Phase 5 (ADR-614, migration `20261162000000`): `resolveSegment` now unions place-tree
> selectors with the trait grammar, and the advanced facets are activated. Every recipient still
> routes through the one `resolveSendGate`.

**The unlock for "message any segmented category."** Today place-tree (circle/hub/nexus) and
contact-segments are separate targeting worlds; you cannot email a circle.

**Build:**
- Extend the audience resolver (`lib/spaces/audiences.ts` + `lib/studio/campaigns.ts`
  `resolveSegment`) to accept a **place-tree selector** (`circle:<id>` / `hub:<id>` /
  `nexus:<id>`) that resolves memberships → profiles → contacts, unioned with the existing
  trait-segment grammar. One audience type, both worlds.
- Activate the **stubbed advanced facets** (`engagementDepth`, `resonanceTier`, `churnRisk`,
  `consent`) by joining `member_traits` — they are already accepted and stored, they just don't
  narrow yet.
- Every resolved recipient still routes through the one `resolveSendGate` (suppression → consent
  → preference → frequency cap). No new send path.

**Best practice honored:** dynamic, rule-based segments that combine behavioral + lifecycle +
membership dimensions, over static lists.

### Move 5 — The owner daily brief + the "who-got-what" control panel (asks 4, 10) ✅ shipped
> ✅ Shipped: the `vera-owner-brief` cron as Phase 7 (ADR-616) and the control panel + broadcast
> recipient log as Phase 5 (ADR-614, `/admin/marketing/messaging/control-panel`). The brief is
> read + compose only; the Dispatch fan-out bug fix routes through `resolveSendGate`.

**Build:**
- **Daily owner brief:** a new cron (`vera-owner-brief`, daily after `refresh-traits`) that runs
  `buildTodayCards()` per operator/Space and sends the 5 moves as an email/push through the
  existing gate + outbox — turning Vera Today from pull-only into the "keeps the owner updated"
  push the owner asked for. Frequency-capped; drafted through `withVoice`; never auto-acts.
- **Messages control panel:** one operator view composing the ledgers that already exist —
  `contact_interactions` (per-person touches) + `outreach_sends` (per-recipient email status) +
  `email_events` (opens/clicks/bounces) + `notification_queue` (in-flight) — into a "what is
  going / went to whom" console at `/admin/marketing/messaging`. **Add a recipient log to
  broadcast fan-out** (`createAndPublishDispatch` currently persists none) so Dispatches appear
  in the panel too.

**Best practice honored:** scheduled owner digests require a real scheduled trigger (an LLM chat
cannot self-schedule) — the cron is the correct mechanism; draft-and-approve, never auto-send.

### Move 6 (parallel track) — The subscription preference center (ask 11) ✅ shipped
> ✅ Shipped as Phase 6 (ADR-615, migration `20261161000000`): topics (comments + marketing) +
> frequency, per-circle/per-Space mutes, the consent-scope UI, contact-keyed preferences, and the
> preference-center landing. Transactional stays carved out and always-on.

Can run alongside Moves 1–5; touches the consent layer, not the timeline.

**Build:**
- Expand the preference model from the fixed 4×3 grid to **topic + frequency**: add
  `comments`/`replies`, `marketing`, and a **frequency selector** (real-time / daily digest /
  weekly digest) per the 2026 preference-center standard (robust centers see ~30% fewer
  unsubscribes than a bare opt-out).
- **Per-circle / per-Space topic toggles** — model preferences as `(subject, topic, channel,
  state)` so a member can mute one circle without leaving the platform.
- Surface the **existing consent scopes** (`email_marketing`, `ai_memory`, `analytics`) in the
  settings UI — today they are ledger-only with no control.
- **Contact-keyed preferences:** `notification_preferences` is `profile_id`-only; non-member
  `contacts` have no preference row. Add a `contact_channel_preferences` surface + a
  preference-center landing keyed to the existing per-Space unsubscribe token, so a non-member
  can opt down a topic instead of only hard-unsubscribing.
- Keep **transactional carved out** in code and UI (account/security always sends), and keep the
  real-time sync guarantee (the gate is checked at send time — already true).

**Best practice honored:** granular topic + frequency control, transactional/marketing
separation, topic-level opt-down beside a global unsubscribe, real-time sync, changes logged to
the timeline as a consent audit trail.

---

## 4. Deliverability + compliance guardrails (already strong; hold the line)

The scan confirms the hard 2026 bulk-sender requirements are met: dedicated `send.` subdomain,
RFC 8058 one-click `List-Unsubscribe` + `List-Unsubscribe-Post`, hard-bounce/complaint
auto-suppression, a global suppression list checked before every send, and a 95 KB size guard.
Two standing items to keep on the roadmap (already noted in the architecture, not regressions):

- **Marketing/transactional subdomain split** (GE6-5, deferred): isolate reputation so a bad
  campaign cannot sink password-reset delivery. Required before high marketing volume.
- **Complaint rate monitoring** held < 0.1% (never breach 0.3%) via the `email_events` ledger —
  surface it on the deliverability console as a tracked metric.

---

## 5. What to ship first (the tight cut)

If the goal is "slick CRM with full interaction tracking" felt in the product this week, the
minimum ordered cut is:

1. **Move 1** — in-app-message adapter + the system/human toggle. The card becomes complete and
   the owner gets the "focus on email + text" control. (Small migration + adapters + one switch.)
2. **Move 3** — the product/offering email block + search-by-owner picker. Contained, net-new,
   high owner value.
3. **Move 5 (brief only)** — the daily Vera owner brief cron. Turns the smart CRM from
   pull to push with existing prediction data.

Then Moves 2, 4, and 6 as the deepening pass. Every move is additive, RLS-consistent
(owner/Space read, service-role write), and rides the one send-gate — no rewrite anywhere.

## 6. Naming + voice

Every member-facing string and every Vera-generated word in these builds passes
[NAMING.md](NAMING.md) and [CONTENT-VOICE.md](CONTENT-VOICE.md) (no em dashes, skeptic test,
§10 checklist). Product nouns: **Contacts** (the CRM), **Email** + **Automations** (the operator
comms), **Vera** (the one voice, incl. the daily brief), **Dispatches** (community broadcast),
**Resonance Engine** (the prediction layer). The preference-center topic labels and the
product-card CTA copy are the copy surfaces to run the voice checklist on.

## References

- Spine + adapters: `lib/crm/interactions.ts`, `lib/crm/timeline.ts`, `lib/crm/person.ts`
- Email: `lib/email-studio/*`, `components/admin/email-studio/*`, `lib/entity-blocks/registry.ts`,
  `lib/commerce/products.ts` (the unused product queries)
- Send/consent: `lib/comms/send-gate.ts`, `lib/suppression.ts`, `lib/unsubscribe-tokens.ts`,
  `lib/notification-preferences.ts`, `lib/consent/*`
- Segmentation: `lib/spaces/audiences.ts`, `lib/studio/campaigns.ts`, `lib/funnels/*`,
  `lib/nurture/*`, `lib/automations.ts`
- Vera + crons: `lib/ai/vera/today.ts`, `lib/vera-dispatch.ts`, `vercel.json`, `app/api/cron/*`
- Governing docs: COMMS-CRM-ARCHITECTURE · CRM-OVERHAUL · NEXT-GEN-CRM · CRM-STRATEGY ·
  EMAIL-EDITOR-PLAN · EMAIL-CAMPAIGNS-FUNNELS-PLAN · AI-VERA
