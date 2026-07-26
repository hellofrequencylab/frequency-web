# CRM Everywhere — the scoped member viewer + communications build plan

> **What this is.** The phased build plan for the owner directive (2026-07-26): mount the
> master-detail **member viewer** (list left, member box right) on every primary management
> dashboard — platform Resonance CRM, Space, **Event**, and **Circle** — with the member box
> keeping its stats as-is, a new **network engagement band** on top (what they adopted, what
> they manage), and **The Path** reborn as a fold-down threaded message history where every
> message names the website event it was tied to. Plus the **multi-channel composer**
> (Email / DM / Text / Dispatch — pick one or all) and the scope spine that makes every
> communication filterable by lane (an event admin sees that event's comms only; the
> platform Resonance CRM sees everything).
>
> **Durable record.** This plan extends [CRM-MASTER-BUILD-PLAN.md](CRM-MASTER-BUILD-PLAN.md)
> ("one person graph, many scoped lenses, a one-way membrane") and composes with
> [CRM-COMMS-CONTRACT.md](CRM-COMMS-CONTRACT.md) (ADR-817),
> [COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md), the tenancy audit
> [CRM-COMMS-AUDIT-2026-07-25.md](CRM-COMMS-AUDIT-2026-07-25.md), and
> [A2P-REGISTRATION.md](A2P-REGISTRATION.md). Decision: ADR-827 in
> [DECISIONS.md](DECISIONS.md). When docs disagree, ADRs + code + `supabase/migrations/`
> win.
>
> Legend: ✅ built · ⏳ partial · ⚠️ needs attention · 🔴 net-new.

## 0. The answer up front

The expensive half exists. The member viewer is already ONE shared block
(`components/people/member-viewer/`) mounted twice (platform `/admin/crm`, Space Resonance
tab); the conversation spine already threads back-and-forth email with HMAC reply
addresses; every spine message already mirrors into the person timeline with a joinable
key (`conv-msg:<id>`); the Event Dispatch composer already has the pick-your-channels
toggle row; SMS is code-complete behind a refuse-first gate. **This plan is six build
phases of composition — two new adapter surfaces, one scope migration, one pane rework,
one fold-down, one composer upgrade — plus one ops track (A2P + inbound email). No
rewrites.**

| Phase | Delivers (owner-visible) | Depends on |
|---|---|---|
| **0 — Scope spine** | Every comm queryable by lane (event/circle/campaign/…); unified send ledger; SMS delivery persisted | nothing |
| **1 — Member box rework** | Network engagement band on top; stats byte-identical; leader-safe detail | nothing (ships alone) |
| **2 — The Path fold-down** | Threaded message path under the member, each message tagged with its website event | 0 (full fidelity), 1 |
| **3 — Message Attendees (Event CRM)** | The member viewer + comm log on `/events/[slug]/manage/crm` | 1 (2 enriches it) |
| **4 — Message Circle (Circle CRM)** | The member viewer + comm log at `/circles/[slug]/crm` via the menu contract | 1, 3 patterns |
| **5 — Multi-channel composer** | One compose, channels Email / DM / Text / Dispatch, per-channel eligibility + one result banner | 0 |
| **A — Ops track (parallel)** | SMS live (A2P), email replies live in prod (inbound secret + MX) | humans, not code |

### Surface names + audiences (owner ruling 2026-07-26; in NAMING.md)

| Scope | Surface name | Audience |
|---|---|---|
| Platform | **Resonance CRM** | everyone in the network |
| Space | **Community Resonance** | members of the Space + followers |
| Event | **Message Attendees** | everyone RSVP'd going or maybe |
| Circle | **Message Circle** | active members of the Circle |

## 1. Invariants (locked; the guards enforce most of them)

1. **Scope narrows within a lane, never replaces it.** `space_id` tenancy semantics are
   untouched (audit 2026-07-25). New `scope_kind`/`scope_id` columns are a filter inside a
   lane; a scoped row's `space_id` must equal the scope owner's lane.
2. **Visibility = the lane you hold.** `web_role` admin/janitor keep the full cross-lane
   lens (F5 ruling). Space operators read `eq(space_id)`. Event/circle leaders read
   `eq(scope_kind, scope_id)` behind their capability gate. All operator reads stay
   service-role behind app gates; no new RLS authorization system.
3. **The F2 ruling is structural.** Operator-initiated messages ride the comms spine and
   are FULLY logged (body on the timeline). Personal member↔member DMs stay stripped
   (`recordDmTouch`, `body: null`). The two lanes never share a table.
4. **Leaders see a trimmed detail.** Event/circle hosts get `audience: 'leader'` — no
   platform pipeline, funnels, steward notes, or global timeline. Staff keep everything.
5. **New conversation surfaces register in the parity guard** (`scripts/check-crm-parity.mjs`)
   and compose the shared modules (ADR-817). New menu items are catalog rows (ADR-553).
6. **SMS stays refuse-first.** Every text goes through `sendSms()` → `evaluateSmsGate`;
   the composer never calls `enqueueSms` directly. UI shows disabled "Coming soon" until
   `isSmsProvisioned()`.
7. **One compose pipeline.** All 1:1 outbound composes through `startConversationMessage`
   (ADR-821); audience blasts through the campaign/Dispatch rails. No third path.

## 2. Phase 0 — the scope spine (data layer)

Full design rationale: paired polymorphic columns mirror `subject_kind`/`subject_id` and
`events.scope_type`/`scope_id`; a jsonb-only scope can't be CHECK-constrained or lane-read
with plain indexed `eq()`; a join table models many-to-many we don't have.

| # | Work | Files | Size |
|---|---|---|---|
| 0.1 | Migration `comms_scope`: `scope_kind text` + `scope_id uuid` on `comms_conversations` + `contact_interactions`; vocab CHECK (`event/circle/campaign/dispatch/booking/membership`), paired-null CHECK, partial indexes on `(scope_kind, scope_id, …at desc)`; `contact_interactions.engagement_event_id uuid → engagement_events(id) on delete set null` | `supabase/migrations/` (next free timestamp) | S |
| 0.2 | Front doors accept scope: `RecordInteractionInput.scope`, `OpenConversationInput.scopeKind/scopeId` (reuse-lookup includes scope so an event thread never absorbs an unrelated send), `startConversationMessage` passes it through; mirror copies scope + `engagement_event_id` | `lib/crm/interactions.ts`, `lib/comms/conversations.ts`, `lib/comms/conversation-compose.ts` | M |
| 0.3 | Caller stamping (one line each, ids already in hand): event dispatch fan-out, event reminders cron, space campaigns, bookings, memberships, tickets, inbound reply inherits thread scope; normalize the `metadata.kind` + snake_case id convention via an exported `InteractionRef` helper; `recordEngagementEvent` returns `{ recorded, id }` | `lib/events/dispatch.ts`, `app/api/cron/event-reminders/route.ts`, `lib/spaces/{email,booking,memberships,tickets}.ts`, `lib/crm/inbox.ts`, `lib/engagement/events.ts` | M |
| 0.4 | Backfill migration from existing metadata (`event_id`, `campaign_id`, `bookingId`, `tierId`, `broadcast_id`) — guarded per-source, nullable forever | `supabase/migrations/` | S |
| 0.5 | Unified send ledger: `email_events` gains `profile_id`, `scope_kind`, `scope_id`, `category` + indexes; `sendRawEmail` writes the missing `sent` leg (+ `suppressed`) with the Resend id; `EmailPayload.attribution` rides the outbox JSON; senders adopt attribution incrementally. NOT `outreach_sends` (it is the Space daily-cap counter) and NOT `contact_interactions` from `lib/email.ts` (client-bundle seam, ADR-613) | `supabase/migrations/`, `lib/email.ts`, `lib/queue/handlers.ts` | M |
| 0.6 | SMS persistence: `sms_events` table mirroring `email_events` (append-only, service-role only); Twilio status webhook inserts instead of `console.info`; `sendRawSms` writes the `sent` leg. Apply `20260626010000_sms_groundwork.sql` FIRST (verify `supabase migration list`) | `supabase/migrations/`, `app/api/webhooks/twilio/route.ts`, `lib/comms/sms-send.ts` | S |
| 0.7 | Lane read filters: `WorkspaceFilter` + `ListInteractionsFilter` gain `scopeKind`/`scopeId`; event-lane and circle-lane callers get scope-eq ONLY, and every write action re-checks `conv.scope_id === gate.scopeId` (the `tenantLaneSealed` pattern) | `lib/comms/workspace.ts`, `lib/crm/interactions.ts` | M |
| 0.8 | Types regen + guard/test updates (ADR-246 untyped-cast sites; `check:crm-parity` unaffected by new params) | `lib/database.types.ts`, touched tests | S |

## 3. Phase 1 — the member box rework (all instances at once)

The pane is one component, so this lands once and appears on platform, Space, and the
new Event/Circle surfaces.

| # | Work | Files | Size |
|---|---|---|---|
| 1.1 | Extract `buildMemberDetail` out of the staff action file into `lib/crm/member-detail.ts` with `audience: 'staff' \| 'leader'` — leader omits pipeline/funnels/steward notes/global timeline; existing loaders become thin gated wrappers | `app/(main)/admin/crm/members/member-detail-actions.ts` → `lib/crm/member-detail.ts` | M |
| 1.2 | Extend `MemberNetwork` with the adopted side: `spacesMemberOf` (space_members), `practicesAdopted` (member_practices) + `practicesCreated`, `journeysAdopted` (journey_enrollments) + `journeysAuthored`, `eventsAttending` (event_rsvps, upcoming listed / past counted). Same `safeRows` + batched-name pattern; pure assembler unit-tested | `lib/crm/member-network.ts` | M |
| 1.3 | `NetworkEngagementBand` at the TOP of the pane: two chip rows — **Manages / hosts** (circles hosted, events hosted, Spaces owned, practices created, Journeys authored) and **Part of** (Circles, Spaces, Practices, Journeys, upcoming Events) — chips expand inline to the named lists (the `NetworkGroup` lists move up from the bottom; one home, not two). **SCORES + ENGAGEMENT stay byte-identical** | `components/people/member-viewer/network-engagement-band.tsx` (new), `crm-member-detail.tsx` | M |
| 1.4 | Roster helper extraction: `rosterFromProfileIds(profileIds) → MemberSummary[]` (batched scores, neutral defaults) out of the space resonance roster, for event/circle reuse | `lib/spaces/resonance-roster.ts` → `lib/people/roster-from-ids.ts` | S |
| 1.5 | Messaging prop generalization: `messaging?: { kind: 'platform' \| 'space' \| 'dm' \| 'none' }` (back-compatible with `messageScope`); `dm` renders the Message button as a bound server action, no email requirement | `components/people/member-viewer/types.ts`, `crm-member-detail.tsx`, `member-viewer.tsx` | M |
| 1.6 | Community Resonance audience per ruling: the Space roster grows a **followers** leg (`space_follows`) alongside active members + imported contacts, badged (`follows:space`) so operators can facet members vs followers | `lib/spaces/resonance-roster.ts` | S |

## 4. Phase 2 — The Path fold-down (threaded message path + website-event ties)

Key finds: the current "Path" items are **life milestones** (`milestonesFromPerson` →
`buildJourney`) — they survive as a compact **Milestones strip** inside the fold, not
deleted. Threading needs NO migration: every spine message already mirrors to the
timeline as `idempotency_key = 'conv-msg:<messageId>'`; the reader just starts selecting
that key and dedupes mirrors against loaded threads. Most website-event ties already
exist in `metadata` (`event_id`, `campaign_id`, `bookingId`, `tierId`); Phase 0 formalizes
them.

Pane order (top → bottom): network band · profile card · Message Member · notes ·
SCORES · ENGAGEMENT · **▸ The Path** (closed by default; fetches on first open).
Inside the fold: Milestones strip, then threads — a conversation is one expandable
thread (`Re: Full Moon Gathering — email · 4 msgs · ⚑ RSVP: Full Moon Gathering`), a
campaign send + its opens/clicks collapse into one thread, everything else is a solo
entry. Every entry carries a `⚑` badge naming its tied website event, linked.

| # | Work | Files | Size |
|---|---|---|---|
| 2.1 | Pure module `lib/crm/message-path.ts`: `PathThread`/`PathEntry`/`PathEventRef`, `assembleMessagePath` (merge interactions + spine threads, dedupe `conv-msg:` mirrors, group by conversation/campaign), `resolveEventRef` (new-style `scope` first, legacy `metadata.kind` second) + unit tests | new | M |
| 2.2 | IO reader `lib/crm/message-path-io.ts`: person-scoped conversations + messages, batch label resolution (events/campaigns — three `in()` reads, no N+1), scope filter as a **loader parameter** (`platform`/`space`/`event`/`circle`), keyset pagination (~20 threads/page) | new | M |
| 2.3 | `idempotency_key` into `ROW_COLS` + cursor param | `lib/crm/interactions.ts` | S |
| 2.4 | Loaders `loadMemberPath` / per-scope variants (gate + tenancy copied from the detail loaders); engagement-summary reads fold into the existing detail `Promise.all` — the initial pane stays exactly as fast | `app/(main)/admin/crm/members/member-detail-actions.ts` + scope siblings | M |
| 2.5 | `components/people/member-viewer/message-path.tsx`: `MessagePathFold` (deferred fetch on open, skeleton, Show older) + `PathTimeline` (threaded renderer, `compact` prop) + `MilestoneStrip` (current rail markup, extracted) | new | L |
| 2.6 | Reuse: `ComposeContextRail`'s past-communication list becomes `<PathTimeline compact>` over already-loaded interactions (zero extra fetch; no duplicate timeline markup) | `crm-member-detail.tsx` | S |

## 5. Phase 3 — Message Attendees (Event CRM)

Event manage stays bespoke (menu contract) — the viewer gets a subroute, linked from the
dashboard. Surface name **Message Attendees**; audience per owner ruling = **RSVP'd going
or maybe**.

| # | Work | Files | Size |
|---|---|---|---|
| 3.1 | Route `app/(main)/events/[slug]/manage/crm/page.tsx` — same gate as manage (`event.editSettings`: host / cohost / staff / parent-scope manager), `DashboardTemplate` titled "Message Attendees", mounts `MemberViewer` with `detailVariant="crm"`, RSVP facet | new | M |
| 3.2 | Roster `lib/events/crm-roster.ts` — `event_rsvps` where `status in ('going','maybe')`, ignore `muted` (a management view, not a push fan-out), badges `rsvp:going/maybe`. Cap 1000. Exports `listEventCrmMemberIds` (the tenancy set). Waitlist/declined rows, hosting-circle non-RSVPs, and invited non-member guests are EXCLUDED per the ruling (the existing Roster/Invited sections still show them; revisit as facets only if asked) | new | M |
| 3.3 | Detail action with the verbatim gate → tenancy → build triple; members via `buildMemberDetail(id, { audience: 'leader' })` | `app/(main)/events/[slug]/manage/crm/event-detail-actions.ts` | M |
| 3.4 | Messaging: `messaging={{ kind: 'dm' }}` bound to the existing host↔guest DM (`openFollowUpDm`). (Phase 5 upgrades this to the full channel picker) | wiring | S |
| 3.5 | Dashboard link "Open guest CRM" + optional `event.crm` catalog row (`slot: 'comms'`, `render: 'link'`) with an explicit `hrefForEntitySurface` case BEFORE the `event.*` prefix fallback | `app/(main)/events/[slug]/manage/page.tsx`, `lib/admin/modules/registry.ts`, `lib/admin/entity-surface-hrefs.ts` | S |
| 3.6 | Event Conversations tab (can trail v1): leader-inbox clone gated on `event.editSettings`, list filtered to the event's people (v1 participant filter; scope-eq once Phase 0 rows exist). **Register in `SURFACES` + import every shared module** (ADR-817) | `app/(main)/events/[slug]/manage/crm/conversations/` | L |
| 3.7 | Fix `requireLeadFloor`'s "leads something" probe to also check `events.host_id` (3 lines, correct regardless) | `lib/admin/guard.ts` | S |

## 6. Phase 4 — Message Circle (Circle CRM)

The pure catalog path: one row + one page. Surface name **Message Circle**; audience =
active members of the Circle.

| # | Work | Files | Size |
|---|---|---|---|
| 4.1 | Catalog row `circle.crm`, label **"Message Circle"** (scopes `['circle']`, `requiredCapability: 'circle.moderate'`, `slot: 'comms'` — its first non-space use, `render: 'link'`) + explicit `hrefForEntitySurface` case → `/circles/[slug]/crm`; `check:menu` + registry/console test updates | `lib/admin/modules/registry.ts`, `lib/admin/entity-surface-hrefs.ts` | S |
| 4.2 | Route `app/(main)/circles/[slug]/crm/page.tsx` — `circle.moderate` gate (host / stewardship edge / staff / parent leader), mounts the viewer | new | M |
| 4.3 | Roster `lib/circles/crm-roster.ts` — active `memberships` ∪ `circles.host_id` via `rosterFromProfileIds`; exports `listActiveCircleMemberIds` | new | S |
| 4.4 | Detail action (gate → tenancy → `audience: 'leader'`) + DM action `openCircleMemberDm` | `app/(main)/circles/[slug]/crm/member-detail-actions.ts` | S |
| 4.5 | Conversations: NO fourth surface in v1 — the DM/reply flow already lands in `/lead/inbox` (circle hosts pass `requireLeadFloor` by construction); link to it. A scoped tab later follows the 3.6 recipe exactly | link | S |

## 7. Phase 5 — the multi-channel composer (Email · DM · Text · Dispatch)

The channel-toggle row copies the proven Event Dispatch pattern into the CRM composers.
Email is the base chip; DM / Text / Dispatch are opt-in; every chip disabled-with-reason,
never a silent no-op. Preview line reads "Email 42 · DM 37 · Text 5" before send; one
send action returns one per-channel result banner.

**DM-as-a-channel ruling (structural F2 compliance):** operator DM = a spine conversation
(`kind 'crm'`, `channel 'in_app'`, `member_profile_id` bound) — fully logged, team-shared,
replies thread in the Conversations workspace. It surfaces to the member in the existing
member thread view (the support-inbox surface, re-copy'd "Messages from the team", with a
bell notification). Personal member↔member DMs are untouched and stay body-stripped.

| # | Work | Files | Size |
|---|---|---|---|
| 5.1 | `startConversationMessage` gains `channel?: 'email' \| 'in_app'` — the `in_app` branch appends on the spine (no enqueueEmail/Reply-To) + best-effort bell row (`operator_message`). Parity-owned shared module + tests | `lib/comms/conversation-compose.ts` | M |
| 5.2 | `lib/comms/composer-send.ts` (new): the multi-channel fan-out — audience in, per-channel gates per recipient (`resolveSendGate` email/inapp, `sendSms` for text), per-recipient skip ledger, per-channel counts + reasons out | new | L |
| 5.3 | Migration `composer_sends` — per-recipient channel ledger (`send_id, channel, profile_id, status sent/queued/skipped/failed, reason`); control panel reader. (Not `outreach_sends` — space-shaped; not `dispatch_recipients` — needs a dispatch id) | `supabase/migrations/`, `lib/messaging/control-panel.ts` | M |
| 5.4 | SMS plumbing: `SmsCategory` + `'lifecycle'`; `EnqueueSmsArgs` gains `ownerProfileId`/`spaceId`/`idempotencyKey` so the timeline touch lands in the operator's lane (today it lands in the recipient's own book — a real bug); SMS char/segment counter + server-appended STOP suffix | `lib/comms/sms.ts`, `lib/comms/sms-send.ts`, `lib/queue/handlers.ts` | M |
| 5.5 | Composer UI + actions, both lanes: toggle row, `previewChannelEligibilityAction`, branch — 1 recipient email → `startConversationMessage` (threads back); N ad-hoc → campaign path; DM ≤25 recipients (the group-DM cap) as individual spine threads; Dispatch only when the audience is exactly one led circle/event chip (then email rides the Dispatch fan-out — one email per person, one ledger, no double-send) | `components/admin/crm/member-composer*.tsx/ts`, `components/spaces/crm/space-member-composer*.tsx/ts` | L |
| 5.6 | Dispatch core extraction: `publishDispatchCore` out of `createAndPublishDispatch` (FormData decoupling); event chips delegate to `composeEventDispatch` | `app/(main)/broadcast/actions.ts` | M |
| 5.7 | Scoped personal-DM policy module `lib/messages/scoped-dm.ts`: `canDmEventGuest` / `canDmSpaceMember` / `canDmCircleMember` + one `sendScopedDm` wrapper (scope gate → block check → rate limits 30 threads/day, 20 msg/min → ungated seam → `recordDmTouch` body-null). Refactor the two existing event callers onto it | new + `app/(main)/events/[slug]/manage/actions.ts`, `social-actions.ts` | M |
| 5.8 | Member-facing surface: thread-view copy "Messages from the team", kind badges (Frequency team vs Space name), bell type `operator_message` + href | `app/(main)/support/`, `components/layout/notification-bell.tsx`, `lib/notifications-map.ts` | S |
| 5.9 | Channel-aware replies in all three parity surfaces via one shared helper (an `in_app` conversation replies `in_app` + bell) — lock-step, guard-covered | the three `actions.ts` surfaces | M |

## 8. Track A — ops (parallel, human tasks)

| # | Task | Blocks | Status |
|---|---|---|---|
| A.1 | Ship the terms-of-service page (`/terms`) | A2P campaign filing (carrier requirement) | 🔴 |
| A.2 | File A2P brand + campaign per [A2P-REGISTRATION.md](A2P-REGISTRATION.md); ~10–15 day review | all real texting | ⏳ |
| A.3 | Apply `20260626010000_sms_groundwork.sql` (verify `supabase migration list` first), regen types | SMS consent reads | ⏳ |
| A.4 | Set `SMS_*`/`TWILIO_*` env flags (also add to `.env.example`) | gate flips open | ⏳ |
| A.5 | Set `RESEND_INBOUND_WEBHOOK_SECRET` + MX on the reply subdomain | email back-and-forth in prod | ⚠️ inert today |

## 9. Sequencing + PR slicing

Phases 0 and 1 are independent — start both. 2 wants 0+1; 3 wants 1; 4 wants 3's
patterns; 5 wants 0. Suggested PRs: (1) Phase 0 migrations + front doors + stamping;
(2) Phase 1 pane rework; (3) Phase 2 Path; (4) Phase 3 Event CRM; (5) Phase 4 Circle
CRM; (6) Phase 5 composer in two cuts (5.1–5.4 plumbing, 5.5–5.9 UI). Track A runs
alongside from day one (A.1 is the long pole's trigger).

Every PR runs the standing guards: `pnpm check:menu`, `pnpm check:crm-parity`,
`pnpm check:canon`, `pnpm test`, `pnpm build`. Types regen after each applied migration.

## 10. Risks

- **Tenancy is the whole security model.** Every new loader reads via the admin client;
  the gate → tenancy-set → build triple must be verbatim on event/circle (a missed check
  = any host reads any member). Copy the space loaders, then diff.
- **Altitude leak without 1.1.** Shipping the pane to hosts before the `audience:
  'leader'` trim leaks staff CRM internals. 1.1 lands first in Phase 1.
- **Roster sizes.** Big public events: cap reads, viewer filters client-side over what it
  holds; revisit server search if a real event exceeds the cap.
- **Plain-text derivation** from studio block drafts for DM/SMS bodies needs a text
  render from `lib/email-studio/render` — spike early in Phase 5.
- **The `inapp` router channel has no outbox handler** — the DM channel deliberately
  bypasses `routeNotification` (direct spine + bell writes). Don't "fix" one with the
  other mid-build.

## 11. Open questions for the owner

1. ~~Naming~~ **RULED (2026-07-26):** Resonance CRM (platform) · Community Resonance
   (Space, members + followers) · Message Attendees (event, going/maybe) · Message Circle
   (circle, active members). Recorded in NAMING.md + ADR-827 addendum. Still open: does
   "The Path" need a NAMING.md entry to disambiguate from the milestone strip?
2. **Member-facing inbox copy:** rename the support surface "Messages from the team"?
3. **Dispatch-from-composer scope:** v1 allows exactly one led circle/event chip — is
   hub/nexus (Guide/Mentor downline) wanted in v1 or a follow-up?
4. **Circle co-member DMs:** this plan deliberately does NOT open member↔member DMs
   beyond friendship; leaders message their scope. Confirm.
