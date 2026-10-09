# Space email build plan

> Complete Frequency email and account messaging before public launch, with Daniel Tyack Space as the controlled pilot.

Implementation status belongs exclusively to `docs/BUILD-BACKLOG.json` and its ledger fragments. This specification defines scope, dependencies and acceptance criteria; it does not claim implementation. Parent program: PROG-EMAIL1. `docs/space-email-packets.json` is a static dependency specification, never a second status ledger.

## Product destination

Spaces send authenticated email under their own names and domains, receive useful replies in a shared inbox, manage complete campaigns and lifecycle journeys, and see honest delivery and business outcomes. Keep Resend, existing conversations, CRM and DM stores. Reuse website ownership/DNS onboarding without coupling email readiness to website readiness. Build external mailbox forwarding first; synchronization is a separate opt-in integration, not mailbox hosting.

The site is live but prelaunch, so low activity is expected. This program finishes architecture before broad adoption while preserving existing data and live routes. Pilot: Daniel Tyack Space, slug `danieltyack`, domain `danieltyack.com`, ID `9f58e07e-8912-4c3e-8551-d15b275dc768`. On 2026-10-08 email was enabled and 520 contacts all had unknown consent. Loaded addresses are not a marketing audience. Never bulk-convert consent. Daniel initiates the upcoming test; observe and reconcile its evidence without triggering additional messages.

## Email value ladder

| Capability | Free Space | Paid Space |
| --- | --- | --- |
| Sending identity | Space name on an authenticated Frequency-owned address | Frequency identity or the Space own verified email/domain |
| Reply destination | Tenant-safe Frequency-owned alias into the Space inbox | Frequency alias or verified branded reply route |
| Functional email | Campaigns, individual conversations and operational messages within existing permissions and allowances | Same reliable foundation with the configured paid allowances |
| Custom identity | Not available by default | Available after current entitlement, ownership and verification pass |

Use existing plan names, prices and email allowance meters; do not invent prices or assume website-domain entitlement grants email identity. Add a dedicated custom-email identity capability to the existing value ladder and check it in setup, defaults, every sender and the provider dispatch boundary. A paid subscription permits setup; it does not imply a verified domain. On downgrade, new intents use Frequency, existing queued custom intents hold for an explicit owner choice, and replies to already-sent mail remain routable while domain ownership is valid. Never silently rewrite an authorized queued sender or grant all free Spaces custom identity when billing is disabled. Explicit audited complimentary grants follow the existing entitlement canon.

## Phase sequence

Phases define complete usable outcomes. Independent packet work may overlap only where dependencies and file ownership permit. No phase closes on a scaffold or screen alone.

| Phase | Complete outcome | Packets |
| --- | --- | --- |
| 0 | Pilot and delivery contract | baseline, delivery-contract |
| 1 | Reliable outbound delivery | atomic-intents, provider-acceptance, dispatch-policy, conversation-outcomes |
| 2 | Recoverable events | durable-events, event-projections |
| 3 | Space domains and identities | email-value-ladder, identity-model, domain-onboarding |
| 4 | Branded receiving and replies | tenant-inbound, campaign-replies, threading-bridge |
| 5 | Complete campaigns | audience-eligibility, campaign-accounting, capacity-fairness, campaign-workspace |
| 6 | Brand templates and rendering | brand-templates |
| 7 | Shared inbox | inbox-workspace, attachments |
| 8 | Individual account notifications | dm-notifications |
| 9 | Lifecycle automation | journey-triggers, journey-runtime, journey-workspace |
| 10 | Reporting and operations | conversion-reporting, delivery-operations, ai-assistance |
| 11 | Existing mailbox coexistence | mailbox-forwarding, mailbox-sync |
| 12 | Prelaunch release proof | launch-proof |

## Focused execution and completion rules

Run `node scripts/space-email-program.mjs --json` to derive eligible packets from the merged canonical backlog. A packet row identifies itself with `source.ref` containing `PROG-EMAIL1 packet:<key>`. Allocate a new row through `ledger:next` only after revalidating existing overlapping work. One packet/row per feature PR. Keep dependency specification free of mutable status.

The coordinator permits baseline evidence and the contract in parallel, then contract-independent identity work alongside the recovery foundation. Serialize changes to shared sender, queue, router, schema, render and catalog contracts through the integrator. UI work can use fixtures while external provider configuration is unavailable. Do not pick unrelated editor, website, billing, SMS, mobile or backlog cleanup.

For each selected packet: refresh main, inspect active PR ownership, rerun the existing premise probe, claim a canonical row, implement in an isolated branch, add a consequence probe that measures real behavior, verify failure recovery and permissions, create a reviewable PR, and update the canonical fragment only when its probe passes. Check required CI and preview; observe production only after deployment actually succeeds. Follow current AGENTS.md and deploy/database canons. A merge is a production deploy; never merge red, force-push, change safety budgets or apply destructive shared-database commands. Keep additive migrations, consumer-before-producer rollout, bounded backfill and rollback explicit. Parent remains open until actual end-to-end evidence is recorded.

The recurring executor resumes one dependency-ready packet per checkpoint and may delegate disjoint implementation and review tasks. If all ready work awaits a real external prerequisite, record it once and wait. Credential absence, provider API uncertainty and owner pilot tests are not permission to fake evidence or wander into unrelated work. No broadcasts, contact enrollment, DNS replacement, subscription purchase or mailbox OAuth grants are inferred from authorization to build software.

Core launch depends on forwarding support but not optional mailbox synchronization. The full program still includes `mailbox-sync`; report it separately if provider consent or product configuration is outstanding. Final completion of the complete requested program requires its adapter and integration evidence as well, or an explicit user scope change.

## Verification and report contract

Each feature row needs a meaningful executable consequence probe, plus relevant unit/integration/browser checks. Source tests, mock provider tests, preview deployment, production deployment and real mailbox verification are different evidence categories. Live pilot evidence is owner-triggered and redacted. The final manual release gate records actual authenticated message headers, correct Space replies, second-Space isolation and measured latency; it must not pass merely because code or ledger rows exist.

Suggested pilot objectives: normal-load transactional enqueue-to-provider p95 under 60 seconds; inbound-to-inbox p95 under 60 seconds; every accepted send has a durable intent and provider reference; every failure/uncertain send is visible; no unauthorized cross-Space access. Measure actual sample counts/window and revise dispatch cadence/capacity before promising these targets. Resend's 24-hour idempotency retention cannot justify unbounded exactly-once claims: unresolved acceptance beyond that horizon holds for reconciliation.

At each phase completion, report shipped/reviewable PRs and commits, canonical probe outcomes, browser/fault/concurrency evidence, migrations and rollback, actual pilot observations, constraints and next dependency-ready packet. The final report includes all phase coverage, provider readiness, honest remaining integration gates and actual deployment status. Keep reports in PRs or user-facing output snapshots; canonical implementation status remains the backlog.

## Packet acceptance matrix

| Packet | Dependencies | Required consequence |
| --- | --- | --- |
| baseline | None | Record current source/schema/provider readiness, pilot audience exclusions and exact missing live observations. |
| delivery-contract | None | Inventory all senders and define versioned intent, purpose, identity, acceptance, delivery and uncertainty contracts. |
| atomic-intents | delivery-contract | Commit message, delivery intent and outbox together; bridge crashes cannot strand a reply. |
| provider-acceptance | atomic-intents | Stable Resend key, immutable payload, provider ID, retry classification and hold after unresolved 24-hour uncertainty. |
| dispatch-policy | atomic-intents | Recheck lifecycle, consent, topic, suppression, kill switch, purpose and identity immediately before sending. |
| conversation-outcomes | provider-acceptance | Show queued, accepted, failed, suppressed and uncertain; preserve draft and original intent on retry. |
| durable-events | atomic-intents | Persist verified inbound/delivery events with reclaimable leases and independently retryable projections. |
| event-projections | durable-events, provider-acceptance | Handle duplicates, event ordering, unmatched provider IDs, rebuilds and late linkage without resending. |
| email-value-ladder | delivery-contract | Free Spaces use Space-branded Frequency senders and reply aliases; paid Spaces may configure verified custom email. Enforce entitlement on every entry/worker; downgrade holds queued custom sends and preserves old replies. |
| identity-model | delivery-contract, email-value-ladder | Authorized per-Space identities, purpose defaults, grants and dispatch resolution on every Space send path. |
| domain-onboarding | identity-model, dispatch-policy | Paid custom identity entitlement plus Resend-issued DNS, supported automatic/manual setup, separate sending/receiving readiness, conflict recovery and preserving apex mailboxes. |
| tenant-inbound | durable-events, identity-model | Exact alias/domain tenancy, versioned tokens, legacy routing, revocation and quarantine. |
| campaign-replies | tenant-inbound, event-projections | Per-recipient campaign reply provenance creates one correctly scoped existing conversation. |
| threading-bridge | tenant-inbound, conversation-outcomes | Proper RFC reply headers, sender-bound house bridge and atomic forwarding intent; Gmail/Outlook threading. |
| audience-eligibility | dispatch-policy | Exact dedupe/invalid/unknown-consent/muted/suppressed counts and isolated owner-clicked test mail. |
| campaign-accounting | atomic-intents, event-projections, audience-eligibility | Frozen paginated content/audience, recipient lifecycle, deferred remainder, cancellation and truthful aggregate progress. |
| capacity-fairness | campaign-accounting, identity-model | Atomic daily/monthly/provider reservations, domain ramps, transactional priority, tenant fairness and quota continuation. |
| campaign-workspace | campaign-replies, capacity-fairness, brand-templates | Complete draft/review/test/schedule/timezone/pause/resume/cancel/history flow with failure-preserving drafts. |
| brand-templates | identity-model | Reuse shared rendering for campaign, operational and human mail; plain text, personalization fallbacks, preheader, accessibility and versioned previews. |
| inbox-workspace | threading-bridge, event-projections | Search, mine/unassigned/all, unread/read, assignments, labels, notes, saved replies, collision warnings, snooze and response visibility. |
| attachments | tenant-inbound, inbox-workspace | Authorized inbound/outbound attachments, size/type limits, scanning quarantine, safe download and retention. |
| dm-notifications | dispatch-policy, durable-events | Unread DM notifications and digests, preference cadence, read-before-send cancellation, block checks and correct deep links without exposing private transcripts. |
| journey-triggers | delivery-contract, campaign-accounting | Versioned signup/RSVP/booking/membership/inactivity triggers with deduplicated enrollment and scoped evidence. |
| journey-runtime | journey-triggers, dispatch-policy, capacity-fairness | Durable delay/condition/exit/cancel/reenrollment, DST and outage recovery; every execution step explainable. |
| journey-workspace | journey-runtime, brand-templates | Usable templates, editing, simulation, explicit publish, pause, enrollment inspection and failure recovery. |
| conversion-reporting | campaign-replies, journey-runtime | Separate raw engagement, delivery and real bookings/RSVPs/purchases; explicit attribution and privacy-safe export. |
| delivery-operations | event-projections, capacity-fairness, domain-onboarding | Health reconciliation, measured latency, uncertainty/DLQ, quota forecast, scoped replay, alerts, domain loss and outage runbooks. |
| ai-assistance | inbox-workspace, campaign-workspace | Space-scoped drafting/summaries/audience checks with human review, normal policy, injection tests and real AI usage accounting. |
| mailbox-forwarding | tenant-inbound, threading-bridge | Preserve Workspace/M365 MX; nominated forwarding alias, provenance, loop prevention, test and disconnect. |
| mailbox-sync | mailbox-forwarding, attachments | Separate opt-in adapters for a nominated Workspace/M365 shared mailbox; minimal OAuth, bounded backfill, cursor repair, dedupe, truthful sent transport and revoke. |
| launch-proof | baseline, campaign-workspace, attachments, dm-notifications, journey-workspace, conversion-reporting, delivery-operations, ai-assistance, mailbox-forwarding | Two-Space isolation, pilot user-triggered send/reply/authentication, fault/concurrency tests, real mailbox observations, measured objectives and rollback readiness. |

## Parallel implementation and deployment boundaries

Build disjoint dependency-ready packets in isolated branches. Assign delivery/outbox, identity/domain and campaign/account experience work separately; integrate shared sender, router, schema and template seams in dependency order. Existing editor and AI-accounting branches must finish their current release before email production rollout. Re-read active PR ownership and refresh main at each integration checkpoint; a local packet test does not prove compatibility with later upstream changes.

Every feature PR closes one canonical row and changes at most **40 files**, counting the actual diff against its PR base. Target 15 or fewer. Split larger features into independently deployable prerequisites with their own consequence probes, not arbitrary fragments of an unusable feature. Do not apply a sweep exemption to feature work. A prerequisite row uses a distinct subpacket reference so it cannot prematurely close the parent packet.

Build across successive waves: delivery contract and baseline; atomic delivery and paid identity policy; fresh dispatch policy, provider acceptance and identity registry; durable events and domain setup; receiving and campaign accounting; complete inbox/campaign experiences; notifications and journeys; reporting/operations and opt-in mailbox adapters; integrated launch proof. Overlap waves only where dependencies and ownership permit. Keep additive schema rollout, consumer readiness, dispatch activation and actual mailbox acceptance separately evidenced. Prepare reviewable branches while external release work finishes, then deploy each approved green unit in dependency order and verify it before activating dependent senders.

## Detailed delivery and recovery specifications

Legacy F/I/P labels below identify design detail groups, not phase status. The authoritative phases and packet closure keys are the 0–12 matrix above.


Canonical implementation status lives only in `docs/BUILD-BACKLOG.json` plus ledger fragments loaded by `scripts/lib/ledger.mjs`. This document proposes work and acceptance criteria; no packet here represents shipped work. Inspected current source read-only on 2026-10-08. Pilot: Daniel Tyack Space; observe the user's test, do not send live email autonomously.

## Reconciled existing work

The merged backlog loader confirms the following completed rows. Preserve their behavior and test their consequences rather than reopening broad foundations:

| Existing row | Existing scope | Additional scope needed |
|---|---|---|
| LIVE-091, LIVE-099 | Quota-aware retries and durable Space campaign queueing | Provider idempotency, atomic ledger/outbox and quota reservations |
| SCAN-569 | Conversation batch claim/dedupe | Provider acceptance linkage and honest delivery states across all conversation paths |
| SCAN-615, SCAN-763 | Webhook event-ID dedupe and failure-return fixes | Crash-recoverable claim leases, independent projections and unmatched-event reconciliation |
| SCAN-616, LIVE-172 | Sender lease recovery and campaign-recipient replay avoidance | Frozen recipients, deferred remainder and terminal accounting |
| LIVE-236 | Space events and delivery feedback | Monotonic projection, conversation outcomes and crash recovery |
| LIVE-727 | Lifecycle hold at queue drain | Space kill switch, suppression, consent and topic rechecks at dispatch |
| SCAN-703, SCAN-704, SCAN-706 | Composer reset, honest audience messaging, campaign failure visibility | Expanded deferred/cancelled/accepted campaign state model |
| SCAN-728, SCAN-734 | Correct unsubscribe category and understandable preference labels | Queued marketing dispatch recheck using persisted purpose |
| OWN-051, SCAN-617 | Global conversational address configuration/header format | Space identity resolver supplied by identity workstream |

No new row IDs are claimed here. Builder obtains IDs via `ledger:next`, writes one feature packet per PR and fragments per affected row; never edits base backlog or ADR files. A repository copy of the plan must be declared in `scripts/planning-docs.txt`. Distinguish gaps from regressions of the narrow completed rows.

### Design detail F0 — observed pilot and contracts

**Packet F0.1: establish evidence without sending.** Record deployed commit, schema constraints, actual reply-domain override, verified Resend configuration and account capacities if authorized access exists. Observe the user's Daniel Tyack Space test with delivery/event/message IDs and UTC timeline, omit recipient addresses and bodies from report. Reconcile provider accepted IDs to queue jobs, outreach rows and conversations. If provider dashboard is inaccessible, report the precise missing observation rather than infer success.

**Packet F0.2: define one delivery envelope.** Enumerate every `sendRawEmail`/`enqueueEmail` caller, including platform security, operational, Space marketing, conversation compose, batch, bridge, Email Studio and DM notifications. Introduce a versioned delivery contract with nullable Space ID for platform mail, logical send key, recipient key, message/campaign reference, purpose/topic, immutable payload hash, identity reference/version, policy context, provider attempt IDs and independent acceptance/delivery timestamps. Do not overload queue done to mean delivered. Define accepted, delivered, bounced, complained, failed, suppressed, cancelled and uncertain outcomes; engagement is separate. Read actual existing check constraints before migration.

Dependencies: none; identity schema can be specified alongside this contract. Acceptance: caller inventory is complete, policy matrix covers each purpose and invalid/unresolved context is visibly held. Rollback: additive envelope/version, legacy readers continue.

### Design detail F1 — recoverable outbound delivery

**Packet F1.1: atomic send intent.** Add `email_deliveries` (proposed name), attempts and references to existing message/outreach rows. Postgres RPC atomically creates message or campaign-recipient reference, delivery intent, reservation where applicable and `notification_queue` job. Stable unique `(tenant scope, logical send key, recipient key)` rejects duplicate intent; null platform scopes need an explicit unique strategy, not ordinary nullable uniqueness. Existing `lib/queue/outbox.ts` enqueue dedupe remains, but application delivery ID is authoritative. Do not put external provider calls inside a DB transaction. Bridge inbound append plus outbound intent must be one transaction, or a persisted delivery intent created in the append transaction must be recoverable before acknowledgement. Scope RPCs tightly; revoke public execution and validate actor/Space in user-facing entry points.

Seams: `lib/email.ts`, `lib/queue/outbox.ts`, `lib/spaces/email.ts` enqueue-before-best-effort-ledger flow, `lib/comms/conversation-compose.ts`, `lib/comms/inbound.ts` house-reply outbound path, batch sender and conversation server actions. Dependencies F0.2. Acceptance: kill process after each write boundary; either no intent exists or all required records/job exist; replay bridge receipt recreates no duplicate and cannot strand a missing job. Concurrent identical submissions create one delivery intent. Rollback: turn off new producers, keep new worker support for already-enqueued versioned jobs; never delete pending intents.

**Packet F1.2: provider acceptance and uncertainty.** Pass stable Resend idempotency key based on delivery ID via the provider SDK's request options; pin request payload/hash on intent. Capture attempted/accepted timestamps and provider ID. Worker lease transitions must be compare-and-swap, attempts audited. Recover provider-accepted/local-write-failed paths with same key inside Resend's 24-hour retention. Beyond the safe retention horizon, an uncertain acceptance must enter reconciliation/hold, never automatically resend simply because DB lacks provider ID. Durable app dedupe prevents a fresh logical intent on replay, but does not prove exactly-once external delivery. Provider lookup/reconciliation, if supported and verified, can resolve uncertainty; otherwise explicit operator decision is required. Separate quota retry, transient failure, permanent rejection and unresolved acceptance.

Dependencies F1.1. Acceptance: simulated provider acceptance then timeout/worker kill yields one controlled provider acceptance within retention; mismatched payload cannot reuse key; >24h unresolved attempt holds with clear reason; permanent failure is visible; no API/network mocks counted as inbox-placement proof. Rollback: pause uncertain/retrying new deliveries; never revert to blind retry for these jobs.

**Packet F1.3: dispatch-time policy.** Central resolver returns allow, terminal suppression/cancellation, or retryable inability to establish policy. Read fresh Space lifecycle, email feature, kill switch, identity readiness, global and Space suppression, contact consent, topic mute, recipient validity, cancellation and purpose-specific permission immediately before provider invocation. Persist contact/profile reference, purpose, topic and relevant operational evidence in job; do not trust a client-supplied transactional classification. Human reply/security policy must be explicitly distinguished from marketing. Legacy jobs resolve context from outreach/message rows; unresolved marketing context is held, not guessed.

Dependencies F0.2/F1.1; identity readiness adapter may initially wrap platform identity. Acceptance: enqueue campaign then opt out, mute topic, disable Space or suspend; provider is never invoked for that pending recipient. Database read failure retries without send. Unrelated account recovery still follows its approved security policy. A race between last policy read and provider acceptance cannot be eliminated by claiming an atomic external transaction; document dispatch cutoff and cancel all not-yet-dispatched work.

**Packet F1.4: honest conversation outcomes.** New outbound messages start queued. Store delivery ID and provider ID; project accepted/sent only after provider acceptance and delivered only from verified outcomes. Multiple recipients require per-recipient delivery rows and a truthful aggregate. Surface queued, retrying, failed, suppressed and uncertain state with safe retry controls in existing inbox. Dead-letter exhaustion changes delivery outcome rather than leaving the message queued forever. Repair old rows only when evidence supports a status; label unknown historic outcomes instead of fabricating delivered.

Dependencies F1.1/F1.2 and F2 projections for delivered. Acceptance: generic handler preserves provider ID; reply rejected by provider appears failed, failed enqueue is never displayed as sent, and user retry creates a new explicitly linked attempt subject to uncertainty safeguards. Rollback: retain backend truth, hide only optional new UI presentation.

### Design detail F2 — durable provider events and reconciliation

**Packet F2.1: durable inbox.** Verify signature before ingestion, store provider event ID and canonical payload durably before acknowledgement. Add received/processing/processed/retry/quarantined states, lease owner/expiry and bounded attempts. Duplicate received event ensures processing is scheduled; duplicate completed event is acknowledged. Transactional claim + expired-lease reclaim replace permanent insert-before-work claims. Preserve existing critical suppression-first behavior. Give suppression, delivery projection, analytics, Space events and CRM projection independent unique event+projection keys and completion state; failure of one cannot lose others or duplicate counts.

Seams `app/api/webhooks/resend/route.ts`, `app/api/webhooks/inbound-email/route.ts`, Space webhook/event helpers, suppression helpers. Existing SCAN-763 improved returned failures but source still permanently dedupes after a process crash; do not describe it as entirely unfixed. Dependencies F0.2; delivery reconciliation depends F1.2. Acceptance: kill after ingestion, claim, suppression, each projection and completion; eventual replay completes exactly one projection each. Invalid signature persists no trusted event. Queue scheduling failure after durable ingestion is recovered by periodic inbox sweeper.

**Packet F2.2: monotonic projection and unmatched events.** Keep immutable facts and calculate outcome without regressing delivered to sent. Hard bounce/complaint are explicit adverse facts; opened/clicked do not overwrite transport status. Receive event before provider ID write: keep unmatched with retry cursor, reconcile after acceptance linkage, bounded expiry to quarantine and alert. Tenant comes from an owned delivery/provider ID, not untrusted provider tags or incoming From. Rebuild projections from event history using an auditable bounded command.

Acceptance: every event ordering permutation yields consistent final state; duplicate click does not double counts; unknown provider ID never routes to a guessed Space; authorized bounded replay repairs missing analytics without resending email. Rollback: disable projection worker while durable intake continues; no destructive event-table rollback.

### Design detail F3 — complete campaigns and capacity

**Packet F3.1: frozen recipient accounting.** Resolve eligible audience at launch, persist snapshot/version and one campaign-recipient row each, including exclusion reason where appropriate. Large snapshots paginate without PostgREST's implicit 1000-row limit. Changing audience after launch does not unexpectedly add recipients; live policy may remove them. States include awaiting capacity, queued, dispatched/accepted, suppressed, failed, cancelled and uncertain. Campaign progress is derived from recipient facts, not `sent` immediately after enqueue; completed submission and transport completion are separate. Partial failure/cancellation semantics must be visible.

Seams `lib/spaces/campaigns-send-due.ts`, `lib/spaces/email.ts`, `lib/spaces/campaigns.ts` and existing composer/report views. Dependencies F1/F2. Acceptance: 1501-member fixture, capacity 500/day, process interruption and overlapping workers eventually account for every recipient with no omitted/repeated intent; cancellation stops pending work and accurately retains already accepted counts.

**Packet F3.2: reservations and fair dispatch.** Atomic reservation RPC serializes Space daily and monthly accounting, per-domain throttle and provider global limits; specify which failures/suppression release reservations and whether billing counts accepted or attempted messages. Separate billable allowance from reputation/safety limit. Fail closed for marketing if quota read fails. Release expired unused reservations safely; accepted reservations never double release. Claim queue with transactional priority plus fair per-Space bulk shares to avoid one Space consuming provider capacity. Resume persisted awaiting-capacity recipients at next window; use explicit UTC or Space-timezone windows and test daylight changes. Present forecast when monthly entitlement exceeds achievable daily allowance.

Dependencies F1.1/F3.1; identity domain mapping. Acceptance: racing campaigns never exceed reservations, abandoned lease releases only unused capacity, bulk cannot starve security/operational mail, quota window resumes without new logical intents. Rollback: stop bulk producers and retain accepted/reserved accounting; revert only scheduling algorithm after jobs safely drain.

### Design detail F4 — tenant isolation and operations gate

**Packet F4.1: adversarial tenant proof.** Test two Spaces with overlapping contacts and addresses, multi-Space staff, removed staff, unrelated members and anonymous callers. Database RLS and server authorization both enforce identity ownership, delivery reads, reply routing, campaign cancellation, projection replay, attachments and exports. Service-role workers must explicitly bind Space in every resolution/query. Global suppression is global by intent; Space suppression stays scoped. Never infer tenant by globally matched email address alone.

Dependencies all new schemas/routes; continuous requirement in every packet, final matrix is release gate. Acceptance: Space A cannot inspect/send through/cancel/replay Space B's delivery or route an inbound reply into B by swapping IDs, tags or tokens. Platform emails remain valid without a Space. Rollback: disable compromised entry point and hold affected sends; retain evidence.

**Packet F4.2: operational rollout.** Shadow projections first; canary Daniel Tyack Space, then second verified Space, then controlled opt-in expansion. Dashboards: oldest queued intent, dispatch latency, event lag, unmatched events, uncertain acceptance, DLQ reasons, quota deferred totals and per-Space bounce/complaint trends. Compare application accepted IDs with provider records where available. Alert thresholds and p95 objectives begin as measured pilot targets, not promises. Preserve redacted audit trail for replay/retry/cancel actions.

Release proof: user-triggered message → accepted → recipient authentication headers verified → delivered → inbound reply → correct Space thread → human response → correct external threading, plus injected crashes and tenant tests. Report distinctly source checks, controlled integration tests, deployed canary observations and inaccessible provider evidence. A green mocked suite alone cannot close live pilot evidence.

## Migration choreography

1. Expand schemas, constraints, indexes and least-privilege RPCs; regenerate types and check actual schema contract.
2. Deploy dual-version consumers before new producers. Assign stable legacy delivery IDs through a persisted mapping; never randomize on each retry.
3. Backfill evidence-backed references in bounded batches, snapshot counts, do not retroactively resend historical messages or fabricate acceptance.
4. Shadow new projections and reconcile parity; canary new atomic producer per channel/Space.
5. Drain legacy jobs; pause unresolved legacy acceptance before key-retention expiry. Only then remove old code and tighten constraints.
6. Each PR runs the consequence probe for its packet plus relevant existing queue/conversation/Space/webhook tests and required repo gates. Build/merge follows `docs/DEPLOY-SAFETY.md`; merging main deploys, so no production merge is implicit in this planning deliverable.

## Automation contract

Executor chooses exactly one dependency-ready canonical row; retests premise, claims ownership, builds in isolated checkout, runs crash/concurrency consequence probe, writes row fragment and reviewable PR, then reports evidence. Checkpoints are bounded and durable. A failed gate, unresolved acceptance or inaccessible provider setting blocks dependent production rollout but permits independent packet work. No repeated live test sends, no unrelated cleanup, no automatic resurrection of old campaigns, no claiming status based on this plan. Replay tools require tenant-scoped IDs, bounded batch, dry-run and audit record; schedule only reconciliation/sweep work that is safe to repeat.

## Detailed identity and domain specifications


This is an implementation specification, not a shipped-status ledger. Canonical work status remains in `docs/BUILD-BACKLOG.json` plus `docs/ledger/rows` fragments. Source was read only. No emails, DNS changes, or provider mutations were performed. Pilot: Daniel Tyack Space (`9f58e07e-8912-4c3e-8551-d15b275dc768`, slug `danieltyack`, domain `danieltyack.com`), active with email enabled. Parent live evidence reports 520 loaded contacts with unknown consent: they are not a marketing test audience; use only Daniel-selected test recipients with explicit test permission. Daniel initiates the forthcoming test. Prelaunch architecture can be completed before public rollout.

## Source findings and existing work

- `lib/comms/from-address.ts` centralizes display-name hygiene but selects a platform environment address. Extend it through a Space identity resolver, preserving formatting helpers.
- `lib/comms/reply-address.ts` accepts only the global `REPLY_DOMAIN`; legacy tokens sign `conv:<ref>` or `conv:<ref>:house`. A branded domain needs registry-backed resolution and an explicit tenant binding, rather than accepting arbitrary recipient domains.
- Existing Domain Connect discovery, signing, application URL, and website template live in `lib/sites/domain-connect`. The website template configures website records only; email requires a separate provider-supported template/operation and ownership scope.
- `lib/spaces/email.ts`, `lib/comms/conversation-compose.ts`, Space conversation actions, generic queue handlers, and inbound-email webhook are the required integration seams. Keep the existing conversations and CRM store.
- Backlog overlap found by title inspection: LIVE-099 (done, campaign senders queued), SCAN-615 (done, webhook dedupe), SCAN-616 (done, send lease recovery), SCAN-763 (open, silently failed suppression/event persistence). Existing done labels do not establish that broader audit consequences are fixed. Before coding, read the merged ledger and rerun each relevant consequence probe; add scoped rows only for uncovered work.

### Design detail I1: Identity model and dispatch contract

Depends on common durable delivery ledger and dispatch-time policy work. Implement a server-only `resolveSpaceEmailIdentity(spaceId, purpose)` seam; every Space conversation, campaign, operational notification and bridge resolves through it. Account recovery and platform security email retain their platform identity/policy.

Proposed schema, subject to existing schema reconciliation:

| Entity | Required fields and constraints |
| --- | --- |
| email_domains | id, normalized FQDN, authorized owner organization/Space scope, Resend domain ID, region, sending/receiving capability and separate verification state, DNS record snapshot, health timestamps, revoked_at. Unique provider/domain mapping; explicit grants where multiple authorized Spaces share a domain. |
| space_email_identities | id, space_id, domain_id, local_part, display_name, permitted purposes, paused_at; unique normalized address within domain scope. |
| space_email_defaults | space_id + purpose unique, identity_id FK; database constraint/RPC must prove identity belongs to permitted Space. |
| email_inbound_aliases | exact normalized recipient, space_id, identity_id, destination kind, enabled/revoked timestamps. Unique recipient ownership; no catch-all inferred from contact email. |
| email_domain_operations | durable provisioning/verification operation, caller scope, desired configuration hash, lease, attempts, last safe error, provider ID and reconciliation outcome. |

All exposed tables require RLS and restricted writes. Domain provider secrets and management operations stay server-only. Owners can manage identities; operators can send only through authorized identities. Immutable delivery intent captures identity/config version; dispatch checks current revocation and health, holding the delivery if invalid rather than quietly changing its brand.

Tests: cross-Space identity assignment/ID injection; purpose mismatch; HTML/header injection and Unicode display names; address normalization and local-part validation; revoked grants; identity changes between enqueue and delivery; account-security separation. Gate: two fixture Spaces cannot read or use each other's identities, and every Space send path carries a validated identity ID.

### Design detail I2: Resend provisioning and DNS onboarding

Provision domains with a retry-safe operation ledger and reconcile uncertain provider-create outcomes against the registry/provider before repeating. Store actual Resend-returned DNS records, not copied region-specific strings. Distinguish request accepted, DNS pending, sending ready, receiving ready, degraded and paused. A provider API request success is not DNS verification.

Wizard sequence: select authorized domain; detect existing MX/mailbox; choose conversation/marketing/operational identity and receiving strategy; show exact record changes; apply only through supported provider workflows or manual instructions; poll verification with bounded retries; choose defaults; controlled delivery/reply check. Model `updates`, `notify`, and `reply` subdomains as recommended defaults, not mandatory combinations; tell the owner the number of provider domains required before provisioning.

Reuse website domain-selection and provider-discovery UI. Separate email operation state includes Space, domain, desired capability, nonce and expiry, so website callback state cannot authorize email changes. Domain Connect email template onboarding is an external prerequisite: capability detection must remain honest and manual DNS stays available. DNS ownership demonstrated for one website must not automatically confer sending permission to another Space.

Preserve existing apex MX for Google Workspace/Microsoft 365. Default receiving to a dedicated subdomain. Do not add competing MX to attempt dual delivery. Preview DNS conflicts, existing SPF and DMARC before any change; SPF modification must yield one valid record at the affected hostname and respect lookup limits. Never overwrite an established DMARC policy automatically. Remove only records tracked as created by this operation and still matching its values; shared/provider domains cannot be deleted as a consequence of one Space disconnecting.

Provider prerequisites: verify actual account domain allowance, region support, domain-management credential permissions, receiving capability, webhook subscription and signing secret, quota/rate limit, tracking settings and domain ownership conflict behavior. Never put Resend or DNS management keys in browser code.

Tests: create timeout after provider success; duplicate submission; API 429/5xx; expired/mismatched callback; existing Workspace/M365 apex MX remains byte-for-byte intact; existing SPF/DMARC repair guidance; DNS propagation timeout; unsupported provider; verification later regresses; disconnect of a shared domain. Gate: Daniel Tyack Space can complete the setup state machine, and its actual send/reply authentication test succeeds once user-controlled external configuration and test are available.

### Design detail I3: Tenant-aware inbound and useful campaign replies

Resolve verified webhook envelope recipients against owned domains and exact aliases before contact lookup. Reject/quarantine unknown domain, ambiguous multi-Space recipient set, revoked alias and valid token used on the wrong tenant domain. Do not use spoofable visible From/To as tenant authorization. Persist inbound delivery intent and routing decision before processing; retries dedupe on provider event and inbound ID. Maintain aliases for retired send identities long enough to route replies to old messages, with a documented retention policy.

Introduce v2 token input containing version, Space ID, conversation or campaign-recipient ID, role, domain/alias ID and revocation epoch. Store key version for rotation. v1 addresses already sent continue to validate only on their legacy domain and resolve through the existing conversation's actual tenant. Member reply tokens allow inbound thread append only; house bridge tokens must also validate current authorized operator sender and cannot independently grant outbound impersonation from a leaked token. Quarantine mismatches rather than execute a house action.

Campaign Reply-To is per logical campaign recipient delivery. On first human reply, atomically create/reuse a Space conversation referencing that delivery and campaign; later replies reuse it. Mark replies in analytics once per genuine inbound message, exclude auto responders, preserve opt-out state and do not reenroll recipients. Ordinary messages to registered public aliases create a new contact conversation in that Space, with abuse controls and dedupe. Replies to legacy platform sends continue working.

Outgoing human responses capture provider-confirmed Message-ID and proper In-Reply-To/References. Preserve existing participants; replying cannot leak a campaign audience, arbitrary CC set or another Space's contact. A mail application may rewrite visible headers, so test the actual Gmail and Outlook experience.

Tests: valid token/wrong domain; same address contact across two Spaces; forwarded/leaked house token; rotated/revoked tokens; legacy token; recipient list spanning Spaces; duplicate delivery with differing webhook IDs; automated reply loop; first campaign reply concurrent race; suppressed campaign recipient replies; thread headers and quoted-body parsing. Gate: pilot message → inbound reply → correct Space thread → human response is traceable and repeat-safe, with no cross-Space routing in isolation tests.

### Design detail I4: Domain health and staged rollout

Scheduled bounded health reconciliation checks provider state plus relevant DNS records; store health history and actionable repair reason. Pause affected identity after confirmed degradation according to a documented debounce policy, preserving queued intent; alert owner once per meaningful transition. Provider-wide errors must not mass-delete domains or repeatedly notify owners. Record MX strategy so health checks never mistake existing mailbox MX for a failure when forwarding is intentional.

Rollout: feature flag and explicit pilot allowlist for Daniel Tyack Space; verified fixtures first; owner-selected test recipient next; second Space isolation pilot; limited cohort; broader activation only after health/recovery gates pass. Maintain separate flags for identity selection, provisioning and inbound routing. Rollback disables new provisioning/send selection while keeping inbound routes for already-sent messages active and holding branded sends pending repair. Avoid silent fallback to a platform From.

Measure authenticated sends linked to identities, pending verification age, verification failures by record, inbound routing lag, quarantined unknown recipients, domain-health changes and no-duplicate outcome. Product target: sender and reply path readiness are visible separately and every blocked send has an actionable reason.

### Design detail I5: Existing mailbox forwarding and optional bounded synchronization

Forwarding is the first supported coexistence mode: retain apex mailbox, forward an explicitly selected address/folder/rule to a registered Space receiving alias, dedupe forwarded mail, prevent auto loops and preserve provenance. Provide a test and revoke/disconnect control. Forwarding does not imply sent-folder synchronization or ability to operate Gmail/Outlook mailboxes.

Separate optional product phase: one nominated shared mailbox per Space, Google Workspace and Microsoft 365 adapters, explicit administrator/user consent and minimal approved OAuth scopes, encrypted refresh tokens, selected folders/labels, incremental cursors, webhook renewal, catch-up reconciliation, dedupe provider IDs and RFC IDs, visible sync lag, token revocation, offboarding and bounded backfill. Define which system owns drafts, replies, read state, assignment and deletion before implementing. Keep Frequency conversations canonical for CRM; maintain external-message mappings rather than replacing them. Resend remains delivery transport for Frequency campaigns/operational journeys; connected-mailbox replies require an explicit transport choice because Resend sends will not inherently appear in the original mailbox's Sent folder.

Provider prerequisite review must cover Google OAuth verification and Workspace admin controls, Microsoft tenant consent and webhook subscription limits, and product data-retention choices. Do not promise generic IMAP/SMTP hosting, arbitrary personal mailboxes or a complete mail client in this phase.

Tests: OAuth revocation; expired subscriptions; duplicate change notifications; cursor reset/resync without duplicate messages; forwarding plus sync of same message; loop prevention; reconnect; Space operator loses access; unrelated personal folders never imported; missing external message; send timeout ambiguity. Gate: a nominated mailbox synchronizes the approved scope, disconnect stops reads/writes, and team sees truthful pending/failed/synced states.

## Current primary references

- [Resend create-domain API](https://resend.com/docs/api-reference/domains/create-domain): provider-issued records and distinct capabilities; verified live 2026-10-08.
- [Resend receiving domains](https://resend.com/docs/dashboard/receiving/custom-domains): existing mailbox MX coexistence requires a receiving subdomain or forwarding; verified live 2026-10-08.
- Current Resend navigation exposes beta Inboxes/Threads. Evaluate separately only if needed; do not migrate the existing CRM conversation spine or claim stable mailbox synchronization from a beta API listing.

## Automation contract

Turn each slice into a canonical scoped ledger packet with a consequence probe, dependencies and a single responsible agent. Queue I1 after reliability schema contract; run I2 UI/provider-adapter work against fixtures in parallel with I3 router tests; serialize shared migrations and identity contracts through one integrator. A packet is complete only with green consequence probes and a reviewable PR; production provisioning, DNS and pilot sends require their actual authorized execution context. Automation should continue independent fixture/build work while awaiting that context, report the specific external blocker once, and never record an unrun pilot as passed.

## Required value ladder: functional free email, paid custom identity

User requirement supersedes any interpretation that domain ownership alone unlocks custom sending. Free Spaces use a verified, authenticated Frequency domain, with their Space display name and signed tenant-bound reply routing into their own inbox. Campaigns, individual replies and operational email remain functional within the existing plan allowances and policy controls. Paid Spaces may configure and send from their own verified email/domain. No new prices or invented allowance amounts belong in this work.

Add a dedicated capability such as `space_email_custom_identity` through the existing pricing catalog and entitlement pipeline. Keep it separate from website `custom_domain` (currently website-oriented) and from baseline `email` availability. Confirm paid plan mappings against `lib/pricing/plans.ts`; integrate `lib/pricing/space-plan.ts` set-to-target billing namespace and `lib/spaces/entitlements.ts` `spaceHasEntitlement` semantics, including explicit operator revocation. The current entitlement layer allows top-level manual grants: approved complimentary paid-capability grants must be explicit/audited exceptions, never inferred from ownership or a billing-off environment. Follow existing beta policy deliberately; do not accidentally grant custom identity to every free Space because billing is off. Existing `lib/pricing/meter-limits.ts` and `lib/pricing/space-allowance.ts` remain the email-volume authority.

Gate provisioning, identity creation/default selection, custom From selection and dispatch. The free identity resolver returns Space-branded display name on an authorized Frequency sender and Frequency-owned reply alias. Paid entitlement makes a custom identity selectable only after ownership and verification checks; paying alone does not imply a ready domain.

On downgrade or entitlement revocation, disable new custom-domain sends/provisioning at the effective entitlement change; preserve domain/identity configuration for later upgrade. Already-enqueued custom sends move to a visible entitlement hold rather than silently sending as Frequency. Owner may cancel and explicitly recreate/approve using the free identity, or restore the paid entitlement; an already-provider-accepted delivery is not resent. New drafts default to the free identity and explain the change. Preserve legacy inbound aliases and signed replies for already-sent mail independently of outgoing paid entitlement, subject to domain ownership/abuse revocation. Upgrades reuse verified retained configuration only after fresh health and authorization checks. Domain transfer/ownership revocation may require quarantine of inbound traffic, distinct from a billing downgrade.

Required source enforcement matrix (current enforcement of this new capability does not exist and is not claimed verified):

| Path | Required check |
| --- | --- |
| Domain onboarding/actions and identity defaults | Current Space permission + custom identity entitlement + domain grant |
| `lib/spaces/email.ts` campaign queueing and `handleSpaceCampaignEmail` drain | Shared resolver at creation; current entitlement before provider call |
| `lib/comms/conversation-compose.ts` and `app/(main)/spaces/[slug]/crm/conversations-actions.ts` | Resolve identity centrally; persist immutable selected identity |
| `lib/comms/inbound.ts` house bridge | Operator authorization plus identity entitlement when creating outbound intent |
| `lib/queue/handlers.ts` generic email handler | Require Space/purpose/identity context for Space mail and perform dispatch-time entitlement check; no trusted serialized custom `from` bypass |
| Scheduled campaign and operational notification writers | Common send contract; identity resolver and common drain guard, regardless of worker origin |
| `lib/comms/from-address.ts` | Preserve RFC formatting; replace global-only Space selection with free/paid resolver |
| `lib/comms/reply-address.ts` and inbound webhook | Tenant binding for free and paid aliases; paid sending entitlement never determines ownership of legacy inbound reply |

Tests must cover free Space attempting a paid identity through each entry path and forged queued payload; upgrade; downgrade between queue and drain; entitlement read failure holds custom sends; operator revoke overrides billing grant; billing-off behavior; old paid-message reply after downgrade; paid domain verification loss; free branded campaign/human reply end-to-end. Gate: all Space send paths are statically inventoried and exercise the shared dispatch enforcement, while free baseline email continues within the configured allowance.

## Detailed product specifications


Specification date: 2026-10-08. Implementation status belongs exclusively to `docs/BUILD-BACKLOG.json` and its merged ledger fragments. This document defines desired behavior and acceptance gates; it is not a completion ledger. Read-only source assessment, no production changes or sends.

## Scope and sequence

Deliver a complete branded Space communications system inside Frequency, using Resend and existing stores. Dependencies from the platform lane: durable delivery ledger/outbox, recoverable webhooks, dispatch-time consent, verified Space identity and receiving routing. No duplicate contact database, email engine, DM store, generalized page editor, SMS program or personal mailbox hosting. Existing external mailboxes remain intact. External mailbox synchronization is a separately gated integration packet, not a condition for the Frequency shared inbox.

The pilot is the user's Daniel Tyack Space: `9f58e07e-8912-4c3e-8551-d15b275dc768`, slug `danieltyack`, domain `danieltyack.com`. Parent-agent live read reports active/email_enabled true and 520 loaded contacts, all `consent_state=unknown`; these addresses remain excluded from marketing. No bulk consent conversion is allowed. Provide an explicit owner-only test send isolated from campaign audience and ordinary consent enrollment. Never initiate pilot or audience sends during planning. Provide a user-triggered test send to an explicitly selected test recipient, then capture delivery and reply evidence. Loaded addresses alone do not establish marketing permission.

Each numbered packet maps to one canonical backlog row and one feature PR. Allocate IDs through `pnpm ledger:next`; inspect merged existing rows and reuse applicable IDs before adding. Re-test existing probes before writing code: several raw open rows already have fixes in inspected source, so source and merged ledger must resolve that discrepancy. Use consequence probes rather than checking that a function exists. A phase closes only after its complete user journey and failure recovery pass; an empty screen or isolated server helper does not qualify.

### Design detail P1: Pilot readiness and individual conversation delivery

Depends on platform reliability and pilot identity prerequisites. Complete usable outcome: Daniel can see whether his Space is ready, select one known test recipient, send a message manually, receive the reply and answer it with accurate status.

P1.1 — Readiness and audience truth. Reuse `lib/spaces/audiences.ts`, `lib/crm/contact-audience.ts`, Space entitlements, contact consent and topic preferences. Build the preflight at the existing email entry: active/enabled Space, authorized sender, verified identity, receiving readiness, quota, imported address validity, deduplication, global and Space suppression, contact consent and topic exclusions. Show aggregate eligible/excluded/deferred counts and drill-down reasons only to authorized staff. Explain unknown consent as an exclusion from marketing and provide the existing consent workflow; never silently manufacture consent from import. Avoid exposing addresses in logs and report exports. Gate send when preflight cannot resolve safely. Existing candidates: SCAN-704 and consent-related merged rows. Acceptance: an imported fixture containing duplicate, invalid, opted-out, unknown-consent and eligible contacts produces exact, comprehensible counts; a second Space cannot inspect those counts or recipients.

P1.2 — Individual compose and real outcomes. Extend `lib/comms/conversation-compose.ts`, `lib/comms/conversations.ts`, `lib/comms/workspace.ts`, `components/spaces/crm/space-conversation-compose.tsx`, existing signatures and CRM timeline. Show selected recipients, Space sender identity, reply destination, content preview, queued/provider accepted/delivered/failed/suppressed states and failure reason. Keep drafts on failure, clear after one accepted send intent and disable accidental double submission with server deduplication. Safe retry recovers the original delivery intent; explicit resend is a new action with recipient confirmation in the compose flow. Authorize every recipient and conversation, including assignment changes. Address SCAN-735 with a target-membership permission probe before broad shared inbox launch. Acceptance: user-clicked double submission yields one intent; provider rejection remains visible; one user-triggered test can be replied to and answered in the correct Space; no “sent” badge before provider acceptance.

P1.3 — Pilot evidence capture. Add a restricted delivery inspector linked to the message showing intent/job/provider IDs, purpose, policy reason, selected identity, event timestamps, reply route, and redacted header evidence. Record authentication alignment and RFC threading checks from Gmail/Outlook pilot mailboxes when available. Acceptance requires no raw message bodies or recipient PII in the build report, one complete send→delivery→inbound→answer path, and explicit “not verified” for missing provider/account/header evidence. No automatic sends to the loaded audience.

Evidence: extend conversation-compose/from-address/reply-address/inbound tests, audience tests, browser journey and isolated fault injection. Pilot counts and timestamped redacted evidence supplement rather than replace controlled tests.

### Design detail P2: Complete campaign experience

Depends on reliable platform delivery/identity and P1 audience readiness. Complete usable outcome: operator composes branded mail, sees who will receive it and why, tests it manually, schedules in Space timezone, monitors every recipient, pauses/cancels and safely resumes quota-deferred recipients.

P2.1 — Composer and reusable brand templates. Reuse `lib/spaces/campaigns.ts`, `lib/spaces/campaigns-actions.ts`, `lib/spaces/email-templates.ts`, existing template/audience picker, `lib/email-studio/render.ts`, shell/product blocks and `lib/comms/email-template.ts`. Unify on an existing render contract without waiting for the generalized editor. Deliver subject/preheader, sender/reply identity, accessible mobile HTML, plain text, safe personalization with fallback, logo/colors/signature and required postal/unsubscribe footer. Draft autosave must acknowledge failure and preserve the last recoverable version. Preview receives the same content version sent. Template edits never mutate a scheduled campaign snapshot. LIVE-695 is a likely renderer-contract row; remeasure its merged probe. Acceptance: fixture matrix across campaigns, human replies and operational mail renders with accessible links and meaningful plain text; missing merge fields cannot expose another recipient's data; browser editor recovery and actual Gmail/Outlook narrow/mobile preview evidence captured.

P2.2 — Audience preview and send review. Freeze the campaign content and audience snapshot at send/schedule authorization, but re-evaluate consent and delivery policy immediately before dispatch. Include filters, dedupe, exclusion reasons, eligible count, required postal identity, topic, projected quota wait and local/UTC schedule. Controlled test sends use explicitly selected test recipients and never enroll them in automation or mark the campaign launched. “Send now” results say queued and link to the campaign; no success on zero eligible recipients. Clear or lock accepted compose state, preventing repeated clicks (SCAN-703). Acceptance: preview and snapshot agree; consent revoked after schedule suppresses the pending recipient; test mail shows safe merge fallbacks and appropriate label; permissions prevent unauthorized send or edit.

P2.3 — Recipient accounting, scheduling and control. Extend `lib/spaces/campaigns-send-due.ts`, queue contract, `outreach_sends` and `space_email_events`. Add explicit scheduled/sending/waiting-on-quota/paused/cancelled/completed/failed lifecycle and immutable queued/deferred/suppressed/accepted/delivered/failed recipient outcomes. Do not equate completion with all recipients delivered. Persist recipient cursor/reservations so daily/monthly limits resume without omission or repetition. Cancellation stops unaccepted sends and reports already accepted recipients honestly. Display timezone including DST handling and next resume time. Reuse SCAN-705/706 where merged probes still fail. Acceptance: a campaign exceeding the daily allowance resumes across simulated windows exactly once per eligible intent; cancellation races account for every recipient; paused Space cannot drain later; recipient totals reconcile to frozen audience and final policy exclusions.

P2.4 — Campaign replies. Allocate tenant-bound per-recipient reply aliases, reuse signed reply routing and conversation store, retain campaign provenance in the inbox and CRM timeline. Create/reuse one thread per logical correspondent/campaign interaction with no cross-Space contact merge. Acceptance: two Spaces sending the same subject to the same address receive separate correctly branded replies; malformed/token-leaked routing cannot authorize outbound send; reply appears in report and inbox once despite repeated webhook.

Evidence: existing campaign/campaigns-send-due/audiences/template/email-studio tests plus load, quota, cancellation, duplicate-request and scheduled DST scenarios. Browser journey from draft to completed recipient ledger and reply required.

### Design detail P3: Shared inbox and account messaging

Depends on P1 accurate conversation delivery, verified receiving and recoverable inbound events. Complete usable outcome: a Space team can manage inbound/outbound work collaboratively, and members receive controlled unread-message notifications without leaking private DMs.

P3.1 — Team inbox workspace. Extend existing conversation workspace/triage/composer, assignment history, labels, notes and `listSpaceAssignableAgents`. Deliver mine/unassigned/all filters, search with Space-scoped indexes, unread/read state, assignment, labels, open/pending/resolved, snooze with reliable wake-up, saved replies and draft persistence. Add live collision warning when another authorized teammate is drafting or a newer response arrived. Internal notes never enter external payload. Team removal immediately revokes reads/writes/downloads and assignment eligibility. Acceptance: two-team-member browser scenario routes new mail, assigns, notes, snoozes, wakes, answers and resolves; malicious foreign conversation and assignee IDs expose nothing; restored draft cannot overwrite a newer send.

P3.2 — Mail threading and attachments. Persist provider-confirmed Message-ID and References/In-Reply-To ancestry. Hydrate inbound attachments through Resend, store in existing authorized private storage, quarantine until scanning completes, enforce per-file/message limits and safe filenames/content types, provide authorized expiring downloads and outbound attachment selection. Exclude suspicious files from shared access with a visible reason. Sanitized body preview blocks scripts/remote tracking by default; content download requires permissions. Acceptance: Gmail and Outlook replies group naturally; forwarded mail routes safely; inbound/outbound supported attachments survive round trip; malicious file, oversized file, scan outage, expired link and removed teammate are covered; internal notes and other Space files never attach accidentally.

P3.3 — Member unread DM email/digests. Preserve existing `messages`/direct-conversation participation and block checks; reuse notification preferences, send-gate, existing conversation batching cron, weekly digest and durable ledger where suitable, rather than conflating stores. Add explicit preference for unread DM alerts and digest cadence, timezone/quiet hours, per-recipient dedupe, debounce and frequency cap. Notifications contain sender display name and authenticated deep link, with no private transcript by default. Recheck unread/participant/block/suspension/preference state before delivery; recipient reading the DM cancels pending reminder. Do not let replying to notification email impersonate a member or publish a DM. Acceptance: rapid multiple DMs produce one configured digest; read, block, leave conversation or opt out before drain prevents notification; duplicate events cannot duplicate mail; clicking logs in to the authorized existing DM; deleted/suspended sender cannot produce a new notification. Reconcile existing LIVE-191 functionality before extending it.

P3.4 — Individual account/system email correctness. Audit account-security, sign-in and lifecycle notifications through existing auth/provider paths; fix misleading send confirmation such as SCAN-751 if still present. Distinguish Frequency account identity from Space identity: Space domain never sends account reset/sign-in mail. Preserve appropriate account-security policy independent of marketing opt-out. Expose manage-emails categories actually supported (SCAN-733 if still applicable), clear per-Space/topic preferences and separate notification preferences. Acceptance: real test-auth flow obtains valid login link in controlled environment; marketing unsubscribe does not block needed account recovery; transactional links expire and authorize correctly; malicious Space cannot send a platform security message.

P3.5 — Optional external mailbox integration. After P3.1–3.4, implement the existing authorized house-email bridge fully: attributable teammate identity, atomic inbound→outbound intent, permission recheck, loop protection, signed token rotation/revocation and replay recovery. Ordinary owner Workspace/365 receiving remains forwarding/subdomain unless explicit OAuth synchronization is separately scoped. Define supported folders/message actions before adding synchronization. Acceptance: authorized teammate replies from their mailbox, external forwarding/token abuse cannot send, teammate removal invalidates the bridge, retries cannot strand an accepted message without job. No apex MX replacement.

Evidence: role/tenant integration tests and real team/browser flows; existing inbound/assignment/conversation/outbound-batch/send-gate suites; DM unread/digest tests using virtual clocks. Capability and delivery matrix documents distinct DM, external email and account-security behavior.

### Design detail P4: Durable Space lifecycle journeys

Depends on delivery reliability, template/version contract, consent, recipient accounting and usable inbox. Complete usable outcome: operator can activate an understandable welcome/booking/RSVP/membership journey and inspect why each individual entered, received, waited or exited.

P4.1 — Event and execution contract. Reuse `lib/automations.ts`, recorded engagement backbone, existing sequences/templates panels and Space sequence services located during implementation. Register only triggers backed by committed source events: member joined, verified RSVP, booking confirmed/cancelled, membership activated/renewed/ended, contact consent gained and explicitly defined inactivity checkpoint. Security/booking transactions commit first; communication failure cannot roll back or falsely confirm the underlying transaction. Add stable event/version identity, per-Space tenant authorization, durable enrollment/step state, unique `(journey_version,event_or_enrollment,step,recipient)` intent, delayed execution, restart recovery and explainable exit reasons. Never present an unrecorded trigger as available.

P4.2 — Journey authoring and simulation. Offer complete curated journeys first, with editable delays, condition branches, quiet hours, per-recipient frequency budget, re-entry rule, goal/exit rule and snapshot preview. Require a validated, immutable published version; malformed conditions must reject publication rather than silently dropping a condition. Simulation with synthetic contacts reports expected messages/time/policy without enqueueing delivery. Pause stops new sends, disabling cancels pending executions per visible policy; cancellation of booking/RSVP exits relevant reminders immediately.

P4.3 — Operational and marketing lanes. Use business-purpose classification from the common delivery contract. Booking/RSVP receipts/reminders/cancellations and membership notices use genuine event facts and exact time zone; promotional follow-up requires marketing consent. Frequency caps cannot defer urgent account recovery behind a newsletter. Journey history shows source event, frozen version, condition result, policy decision, due time and final delivery, with authorized retry where safe. Acceptance: each curated journey completes from real controlled source action; repeated source/webhook events send once; changed condition/consent/booking state stops pending send; failed execution is visible and resumes correctly after crash; operator publishing cannot escape Space scope.

Evidence: virtual-clock durable execution tests, event recorder contract tests and browser simulation/publication/history journey. Existing automation tests and booking/RSVP/membership source tests extended only where real emission and transactional boundaries change.

### Design detail P5: Outcomes, operations and AI assistance

Depends on immutable delivery/event and campaign/journey provenance. Complete usable outcome: owners can evaluate actual results, operators can diagnose and recover issues, and AI reduces writing work without bypassing permissions or human send intent.

P5.1 — Honest delivery and conversion reporting. Extend `lib/email-studio/analytics.ts`, `space_email_events`, CRM timeline, campaign and journey dashboards. Show unique accepted/delivered/bounced/complained/suppressed/replied counts, policy exclusions, queue delay and failures; label opens/clicks as observed engagement subject to automated fetching. Define conversion windows and source links for bookings, RSVPs, purchases and membership activation with deterministic dedupe; refunds/cancellations adjust economic outcomes. Separate attributable observed conversion from causal claim, and distinguish anonymous clicks, unique recipients and event totals. Multi-campaign attribution rule must be explicit, configurable only if implementable consistently, and versioned in reports. No cross-Space purchase/member reporting. Acceptance: seeded fixture with bot opens/repeated clicks/two campaigns/one purchase/refund gives mathematically correct totals and one conversion under chosen rule; date/timezone exports reconcile with restricted delivery ledger; redacted pilot report contains real delivery/reply evidence.

P5.2 — Delivery operations. Reuse queue dead-letter view, logs/runbooks and cron heartbeats. Deliver role-scoped health dashboard for queue age by lane/Space, identity verification, webhook ingestion/projection lag, unmatched events, bounce/complaint rates, provider capacity and quota forecast. Add automatic domain/Space reputation pause based on documented thresholds and minimum samples; owners see cause and repair path. Replay is permissioned, audited and reuses original delivery identity; does not override suppression automatically. Include provider outage, worker crash, domain loss, scanning outage and webhook failure runbooks. Establish measured objectives initially: normal-load transactional enqueue→provider p95 under 60 s and inbound→inbox p95 under 60 s, subject to queue cadence/capacity fix; 100% accepted sends have durable intent/provider link, every terminal failure visible, no cross-Space access in isolation suite. These are release gates to measure, not unverified promises.

P5.3 — Reviewed AI help. Reuse existing Vera/AI voice and scoped conversation seams. Add optional draft rewrite, conversation summary, saved-reply suggestions and campaign audience/content checks, referencing only authorized Space content. Generated suggestions remain drafts; send/schedule/retry use normal explicit human action and policy checks. Internal notes can inform an authorized internal summary but never leak into proposed external copy unnoticed; cite sources to the operator and show recipient/sender at review. Never make AI invent consent, auto-publish campaigns or impersonate staff. Acceptance: prompt-injection fixture in inbound mail cannot cause send or data access; foreign Space notes unavailable; revoked access blocks generation; edited AI draft passes the same preview and send review as manual content; generation failure leaves original draft usable. Record AI action provenance with content minimization and retention.

Evidence: deterministic analytics fixtures, fault/load/replay tests and operator recovery browser journey; AI authorization/injection fixtures, human review browser journey and no-send assertions.

## Completion and automated build reporting contract

Automated orchestration should claim only email/messaging rows whose prerequisites pass, assign independent product/platform packets concurrently with isolated source branches, and serialize shared schema/render/send-gate edits. Recheck merged row and source premise before pickup; stop a packet on real provider/credential or owner-only dependency, leave exact evidence and proceed with independent authorized work. Do not substitute unrelated backlog or websites/editor work while waiting. Each PR contains migration/backfill/reversal notes where needed, behavior probes, appropriate unit/integration/browser evidence and one ledger fragment. Full repo safety gates remain required; no raising build budgets or deleting probes to pass.

At phase completion report: packet/PR and commit, canonical row probe result, controlled tests and artifacts, browser scenario result, pilot evidence availability, migrations/backfill/rollback, operational metric readings with sample window and counts, known constraints and owner-only actions. Build report distinguishes implementation, controlled verification, preview deployment, production deployment and real mailbox verification. Never describe a plan or mocked test as shipped.

Final report reconciles frozen campaign audience totals, queued delivery intents and provider acceptance links; proves tenant isolation and unsubscribe-at-drain; demonstrates pilot send/reply only when the user sends; states actual measured latency and failure recovery; records that loaded pilot contacts were not bulk emailed automatically.
