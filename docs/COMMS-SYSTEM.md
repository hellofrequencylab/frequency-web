# Frequency Comms — the unified ticketed communication system

> One conversation fabric for every in-house message: support, CRM outreach, leader-to-member notes,
> and inbound replies. As easy as an Apple inbox, as trackable as a helpdesk. ADR-812.

> **Status lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json)** (run `pnpm backlog`). The locked, machine-enforced contract for this suite is [`CRM-COMMS-CONTRACT.md`](CRM-COMMS-CONTRACT.md) (ADR-817, `pnpm check:crm-parity`) and the build doc is [`CRM-MASTER-BUILD-PLAN.md`](CRM-MASTER-BUILD-PLAN.md); this file is the ADR-812 design rationale, and nothing live links to it (checked 2026-09-04).

## The one idea

Collapse the two half-systems we had — the CRM inbox (conversation UX, no ticket chrome) and support
tickets (ticket chrome, welded to a bug table) — into **one channel-agnostic `Conversation`**. Every
message is an attributed entry on a thread that has an assigned agent, a status, and a permanent trail.
Whether it started as support, a CRM email, or a leader's note, it is the same object → **one inbox, one
history, one system of record.**

```
              ┌──────────────────── one Conversation ────────────────────┐
 leader  ►    │  ref · kind · status · assigned agent · reply-address     │   ◄ member reply
 staff   ►    │  conversation_messages[] (each attributed to its sender) ─►│     (routed by the
 CRM     ►    │  the full trail of senders                                 │      per-thread address)
 support ►    │                                                            │
              └────────────────────────────────────────────────────────────┘
                         │ mirrors each non-internal message →
                         ▼
                  contact_interactions  (the CRM person-timeline, unchanged)
```

## Data model (ADR-812, migration `20261210000000_conversations_spine.sql`)

- **`comms_conversations`** — `ref` (bigint routing key from 1000), `kind` (support|crm|leader|broadcast|dm|…),
  `status`, `priority`, `channel` (email|sms|in_app|whatsapp|…), the polymorphic counterparty
  (`subject_kind`/`subject_id` + resolved `member_profile_id`/`contact_id` + `external_email`),
  `owner_profile_id` (the sender-trail owner), `assigned_to` (agent), `space_id`, `support_ticket_id`
  (link during the additive phase), threading (`provider_thread_id`), the `ai` jsonb seam, and SLA/activity
  timestamps.
- **`comms_messages`** — polymorphic author (`author_id` profile OR `author_contact_id` external),
  `author_kind`, `direction`, `channel`, `body`/`body_html`, `is_internal` (agent notes), threading
  identity (`external_message_id` UNIQUE = idempotency, `in_reply_to`, `references_ids`), attachments,
  `delivery_status`.
- **`comms_assignments`** — append-only "trade" audit (assigned_to, assigned_by, reason, at).
- **`campaigns.reply_mode`** — `broadcast` | `conversation` (the composer's per-send choice).

**RLS** mirrors `support_tickets`: members governed by policies on `get_my_profile_id()` (see own thread,
open a support conversation, post their own reply); staff/agents, CRM, broadcast, and the inbound
reply-address router all use the **service-role admin client** (bypasses RLS), exactly as
`lib/support/store.ts` already does.

**`contact_interactions` is a mirror, not a second source.** After each non-internal
`conversation_message`, the write path calls `recordContactInteraction` with `idempotencyKey =
'conv-msg:' + messageId`, so the CRM card + person-stitch keep reading their timeline with no change.

**Unify path (later phase, additive-first):** support tickets link via `support_ticket_id` now; a later
migration renames `support_tickets`→`comms_conversations` with auto-updatable **compatibility views**
(`security_invoker=on`) so `lib/support/store.ts` and `/support` keep working untouched.

## Reply routing — `lib/comms/reply-address.ts`

`reply+<ref>-<hmac>@reply.frequencylocal.com`. The `hmac` is `HMAC-sha256(secret, "conv:<ref>")`
(mirrors `lib/unsubscribe-tokens.ts`), so the address is **unforgeable + non-enumerable** — an attacker
can guess `ref` but never its tag. Inbound order: parse → `verifyConversationToken` → resolve by `ref`.
**Routing is by the plus-token (primary); email headers thread clients (secondary).**

## Send + inbound wiring (phases 1–2)

- **Reply-mode is exposed in the composer** (`components/admin/email-studio/compose-toolbar.tsx`, threaded
  via `editor-pane.tsx` → `saveEmailCampaign`). A **1:1 member message is born `conversation`**
  (`createEmailDraft('message')` in `app/(main)/admin/email-studio/actions.ts`), so every individual send
  is a reply-able ticket by default; a **campaign defaults to `broadcast`** with a Broadcast ↔ Conversation
  toggle to flip it. `reply_mode` rides its own additive column (fail-safe read via `loadCampaignReplyMode`,
  best-effort write, same pattern as `from_name`).
- **Reply-mode branch in `sendCampaignNow`** (`lib/email-studio/send.ts`): `broadcast` = `noreply@send.`,
  no Reply-To, List-Unsubscribe; `conversation` = display-name-swapped `people@people.` identity,
  per-recipient `Reply-To = buildConversationReplyAddress(ref)`, `Message-ID` set + stored, and
  `openOrGetConversation` + `appendConversationMessage(outbound)` per recipient.
- **Leader → group, as themselves:** `kind='leader'`, `reply_mode='conversation'`, `From: "<Leader> via
  Frequency" <people@people.>` (DKIM-aligned — never the leader's raw mailbox), audience = the leader's
  stewardship downline (`segmentForLeaderDownline` over their circle/hub/nexus edges). Fans out into **N
  conversations**, each on the leader's trail, each independently replyable.
- **Outbound from a thread:** CRM inbox reply (`sendInboxReplyAction`) and support (`addStaffMessage`,
  `!isInternal`) enqueue email with the conversation Reply-To + threading headers, drop List-Unsubscribe
  (1:1 human mail), and append the message. Keep `lib/support/store.ts` build-safe (enqueue via
  `enqueueEmail`, never import the studio send path).
- **Inbound is metadata-only → hydrate first** (ADR-815). Resend's `email.received` webhook carries only the
  received-email `id` + `from`/`to`/`subject` — **no body, no headers**. `loadInboundMessage` (the route calls
  this, not the bare parser) fetches the full content via `fetchReceivedEmail` (`GET /emails/receiving/{id}`)
  and merges `text`/`html`/`headers`/`message_id` in before parsing; without it a reply would thread empty,
  with no loop-guard headers and no dedupe key. Fail-safe: falls back to metadata if the fetch fails.
- **Inbound bridge** (`lib/comms/inbound.ts`, wired into the existing `/api/webhooks/inbound-email`
  route): `parseInboundMessage` (Resend `email.received` webhook — `to`/`received_for`/`message_id`, plus
  `In-Reply-To`/`References`/`Auto-Submitted`/`Precedence` from `data.headers`) → `routeInboundReply`:
  parse the plus-token off any recipient → `isAutomatedMessage` loop guard (drop `Auto-Submitted`/bulk/
  daemon/bounce) → `verifyConversationToken` (a present-but-forged tag is dropped, never falls through) →
  `getConversationByRef` → append inbound (dedupe on the provider `Message-ID`, retiring the minute-bucket)
  → `reopenConversationIfClosed` → notify the assignee (else the trail owner). Anti-spoof: the token
  authenticates the thread, so a from-address that differs from the counterpart's `external_email` is
  recorded but **flagged** on the message (`metadata.sender_mismatch`) rather than dropped. When no
  reply-token is present the router returns `no_token` and the webhook falls back to the legacy
  from-address contact-match (`recordInboundEmail`) — today's CRM inbox is unchanged.

## Per-Space tenancy — every Business Space gets the same technology

The spine is multi-tenant: `comms_conversations.space_id` scopes a thread to one Space (NULL = platform).
`<ConversationWorkspace>` is mounted **per tenant** at `/spaces/[slug]/crm/conversations`
(`app/(main)/spaces/[slug]/crm/conversations/page.tsx`), gated by `resolveSpaceManageAccess` (a platform
staffer gets a read-only `StaffPreviewBanner`) and `isConsoleSpaceType`. The read model is scoped with the
existing `spaceId` filter, and the thread reader is tenancy-checked (`thread.spaceId === space.id`, the same
IDOR guard as `/lead/inbox`). Space actions (`.../crm/conversations-actions.ts`) mirror the platform reply/
triage but swap `requireAdmin` for the space-manage gate + a hard `conv.space_id === space.id` check, and
restrict assignment to the Space's own team (`listSpaceAssignableAgents` = active editor+ members + owner).
A Space seeds its console via `startSpaceConversationAction` (opens a space-scoped conversation to one of
its contacts and sends as the Space, on the `enqueueEmail` path). The Space menu row is `space.conversations`
(`SPACE_MODULES`). The platform operator inbox is tenant-aware: each row shows its owning Space's name.

## The workspace UX (phase 3) — "Apple Mail wearing ticket chrome"

- **One `<ConversationWorkspace scope>`** mounted at `/admin/crm/inbox` (operators) and a new
  `/lead/inbox` (community leaders — `DashboardTemplate`, rail `'none'`). Same body, scoped list +
  agent set.
- **Three regions:** a segments rail (Mine / Unassigned / All · by status · by channel, URL-as-state),
  a conversation list (`<ConversationRow>`: unread weight, channel icon, who, subject/snippet, assignee
  avatar, `StatusChip`, relative time), and a thread reader.
- **Thread reader:** attributed bubbles (inbound left, outbound right with the **real sender's name +
  avatar** — the "trail of senders"), internal notes visually distinct (never a bubble), a docked
  composer that feels like texting.
- **The `<Composer>`** owns the shared footer everywhere (docked reply, `member-composer`,
  `marketing-compose-popup`): the **reply-mode segmented toggle** (Conversation ↔ Broadcast, with the
  consequence written under each), a Reply/Note switch (`is_internal`), the `<VeraDraftButton>` slot, the
  gated Send + consent caption. Full formatting escapes to the existing `EmailEditorPane`.
- **Assignment / trade:** inline assignee control → agent picker (popover desktop, `BottomSheet` mobile);
  "Trade to…" writes an optional handoff **internal note** + reassigns in one action; notify the new
  assignee (`notifications` type `conversation_assigned`).
- **Mobile:** list → thread is a `FormScreen` push-nav stack; the composer sits in the thumb zone; assign/
  status/trade are `auto` BottomSheets; compose is `Dialog align="sheet"`. (Reuses the primitives shipped
  in the mobile-redesign PRs.)

## AI seams (phase 5, designed now)

Four quiet, optional affordances, never a takeover: **Draft with Vera** (a `Sparkles` button in the
composer that streams a suggested reply into the editable field; records `source:'ai'` only on human
Send), a **thread summary** chip, **triage/auto-assign** suggestions on Unassigned rows, and an optional
**sentiment** dot. All land in human-editable fields; every send/assign still runs the gated action. The
seam is the `conversations.ai` jsonb (+ an optional `conversation_ai` history table) and `author_kind='vera'`.

## Deliverability

| Purpose | Identity | Notes |
|---|---|---|
| Bulk / no-reply | `noreply@send.frequencylocal.com` | unchanged reputation; RFC 8058 one-click unsubscribe |
| Conversational send | `people@people.frequencylocal.com` (`EMAIL_CONVERSATION_FROM`) | separate subdomain → bulk complaints never taint 1:1 |
| Inbound reply capture | MX `reply.frequencylocal.com` → Resend inbound | receive-only |
| Brand fallback inbox | `hello@frequencylocal.com` | token-less replies |

Per-subdomain SPF + DKIM; DMARC relaxed-alignment at the apex (`p=quarantine`, `rua` reporting).
One-click unsubscribe on `broadcast` (and `leader` bulk) only — **never** on true 1:1.

## Quiet-time coalescing — batch + digest (ADR-813, `lib/comms/outbound-batch.ts`)

Both are **config-gated OFF by default** (window `0` = off), so the live 1:1 path is byte-for-byte unchanged
until an operator opts in. A single cron `/api/cron/conversation-batches` (every 5 min, `withCronHeartbeat`)
runs both passes.

| Feature | Env (minutes, `0` = off) | What it does |
|---|---|---|
| **Outbound batch** | `CONVERSATION_BATCH_WINDOW_MINUTES` | A burst of replies typed into one thread inside the window is held as `delivery_status='queued'` messages (they still appear individually in the workspace). Once the burst has been quiet for the window, the cron sends **one** coalesced email under the same sender identity (`metadata.batch_from`) and flips them to `sent`. Debounce on the *newest* queued message. |
| **Inbound digest** | `CONVERSATION_DIGEST_WINDOW_MINUTES` | Instead of surfacing every member reply the instant it lands, the cron rolls a recipient's newly-arrived replies (assignee first, else owner) into **one** summary email. Idempotent via a per-conversation `last_digested_at` watermark; a 24h recency floor stops a first-enable flood of ancient threads. The in-app `conversation_reply` notification still fires at receive time regardless. |

Safety properties: the reply actions keep their exact immediate-send branch when the window is `0`; the batch
flush **drains queued mail even when the window is later set back to `0`** (governs debounce, not draining), so
disabling can never strand a queued reply. At-least-once by design (enqueue → mark-sent), matching the outbox.
Schema: `comms_messages.delivery_status` (already in the spine) + `comms_conversations.last_digested_at`
(migration `20261211000000_conversations_digest_marker.sql`) + partial indexes for both scans.

## Email bridge — two-way from your own inbox (ADR-814, `CONVERSATION_EMAIL_BRIDGE`)

Off by default; needs inbound receiving already live. Makes the whole loop run from a normal mail app, no
console required:

1. A member replies → the inbound webhook threads it (as today) **and** forwards a copy to the assigned
   agent's (else owner's) real inbox, with `Reply-To` = a **house** address.
2. The agent replies from Gmail / their phone → that lands on the house address → recorded as an outbound
   message and sent onward to the member, with `Reply-To` = the **member** address. Loop closed.

The safety hinge is the reply-address `role` (`lib/comms/reply-address.ts`): direction is decided by which
**secret-derived** address the reply hits, never by the spoofable `From`.

| Role | Signs | Address | A reply here routes |
|---|---|---|---|
| `member` (default, unchanged) | `conv:<ref>` | `reply+<ref>-<tag>@reply.` | INBOUND onto the thread |
| `house` | `conv:<ref>:house` | `reply+<ref>.h-<tag>@reply.` | OUTBOUND to the member, as the house |

The two tags are distinct HMACs, so a leaked member address can never send outbound and a spoofed From
can't flip direction. A valid house token is always honored (it only exists because we emitted it), so an
agent's reply to an in-flight forward survives the flag being turned off. Outbound is deduped on the agent's
inbound `Message-ID`; the RFC 3834 loop guard runs before both roles.

## Phased build

| Phase | Scope | Risk |
|---|---|---|
| **0 — foundation** *(this PR)* | `lib/comms/reply-address.ts` + test, the `comms_conversations` spine migration, ADR-812, this doc. Additive, nothing wired. | none |
| **1 — send** | `lib/comms/conversations.ts` spine lib; `reply_mode` branch in `sendCampaignNow`; outbound-from-thread (inbox reply + support). Behind the reply-mode toggle. | low |
| **2 — inbound** | Light up the webhook (secrets + Resend MX); token routing + dedupe upgrade + anti-spoof/loop guards in `recordInboundEmail`. | med (external) |
| **3 — workspace** ✅ | `<ConversationWorkspace>` at `/admin/crm/conversations` (`lib/comms/workspace.ts` read model + `lib/comms/labels.ts`): segments rail (Mine / Unassigned / All · by status, URL-as-state), the conversation list, the RSC thread reader (attributed bubbles, internal notes distinct), the `<ConversationComposer>` (Reply / Note toggle) and `<ConversationTriage>` (status / priority / assignee, "Trade" with an optional handoff note → `comms_assignments` audit). Actions in `app/(main)/admin/crm/conversations/actions.ts`; nav leaf `crm-conversations`. Leader `/lead/inbox` + mobile-sheet polish are Phase 3b. | med |
| **3b — leader inbox** ✅ | `/lead/inbox` (`DashboardTemplate`) reuses `<ConversationWorkspace>` scoped to the leader's own threads (`ownedOrAssignedTo`), leader-gated reply/triage actions injected (ownership-checked), mobile compose via `Dialog align="sheet"`. Workspace now takes `basePath` + injected `actions`. | low |
| **4 — leader→group** ✅ | `lib/comms/leader-send.ts`: `segmentForLeaderDownline` (union of the leader's led circles via `resolveSegment('circle:<id>')`) + `sendLeaderMessageToDownline` (fans out into one `kind='leader'` conversation per member, as themselves, consent-gated). `<LeaderBroadcast>` "Message my group" with the reach preview + send tally; `sendLeaderBroadcast` action. | low |
| **5 — AI seams** ✅ | Vera in the composer/triage: `draftConversationReply` (drafts into the composer), `summarizeConversation`, `suggestConversationTriage` (persists priority) in the workspace actions, mirroring support's `draftReply`/`suggestTriage` (`completeText` + `withVoice` + `aiAvailable`/`featureOverBudget`/`recordAiUsage`; budget keys `conversation-draft`/`-summarize`/`-triage`). Buttons render only when the actions are injected (operator inbox gets them). | low |
| **6 — batch + digest** ✅ | Quiet-time coalescing (ADR-813, `lib/comms/outbound-batch.ts` + `/api/cron/conversation-batches`): outbound burst → one email, inbound replies → one digest per recipient. Config-gated OFF by default; see the section above. | none (dormant) |
| **7 — email bridge** ✅ | Two-way from your own inbox (ADR-814, `CONVERSATION_EMAIL_BRIDGE`): forward member replies to the agent's mailbox; the agent's mailed-in reply routes back out to the member via a distinct secret-derived `house` reply-address. Off by default; see the section above. | none (dormant) |

Nothing changes for existing sends until the reply-mode toggle is exposed and flipped. Config to turn it
on: `CONVERSATION_TOKEN_SECRET`, `CONVERSATION_REPLY_DOMAIN`, `EMAIL_CONVERSATION_FROM`,
`RESEND_INBOUND_WEBHOOK_SECRET`, `CRM_INBOX_OWNER_PROFILE_ID` + the DNS records above. Optional quiet-time
coalescing (Phase 6, off by default): `CONVERSATION_BATCH_WINDOW_MINUTES`, `CONVERSATION_DIGEST_WINDOW_MINUTES`.
Optional email bridge (Phase 7, off by default, needs inbound receiving live): `CONVERSATION_EMAIL_BRIDGE`.
