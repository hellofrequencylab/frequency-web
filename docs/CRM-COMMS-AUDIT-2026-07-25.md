# CRM + Messaging — tenancy & cohesion audit (2026-07-25)

> A full scan of the CRM/comms stack against the owner's locked architecture: **the platform
> Resonance CRM is the PRIMARY (full member directory + threaded communication); each Space entity
> has its OWN CRM with shared functionality but COMPLETELY SEPARATE data, with safeties so nothing
> bleeds through.** Plus the live-conversation "thread doesn't show the full conversation" bug.

## 0. Headline

The tenancy model **holds**: per-space unique `(space_id, lower(email))`, the root membrane
(tenant contacts never carry `profile_id`), the signup trigger targets root only, the conversation
spine lanes are scoped, Space timelines read strict `eq('space_id')` (a NULL-lane row can never
surface on a tenant card), per-topic mutes are per-space, and global STOP is intentionally
cross-lane. Fixes below close the leaks that did exist + the reported chat-body bug.

## 1. ✅ The live-chat "full conversation" bug (reported)

**Root cause (confirmed against prod conversation #1002):** the two inbound member replies recorded
as `(no message body)`. The Resend `email.received` webhook is metadata-only and eventually
consistent; `loadInboundMessage` fetches the body from the Received-Emails API. When that fetch
failed **persistently** (not just transiently), `InboundHydrationError` made the webhook 503 on
**every** redelivery until Resend exhausted its retry schedule and dropped the message — so the body
was lost forever, and the operator thread showed the placeholder while the customer's Gmail had the
real text.

**Fix (shipped):**
- **Bounded 503 grace** (`lib/comms/inbound.ts`): keep asking for redelivery for 10 min (covers
  eventual consistency), then DEGRADE — record the message body-less, stamping
  `metadata.resend_email_id` so it can heal later, instead of losing it.
- **Heal-on-load** (`healMissingBodies` + `getWorkspaceThread`): when an operator opens a thread,
  any `(no message body)` email message is re-fetched from the provider (the stored id, else a
  receiving-LIST match by Message-ID for pre-fix rows like #1002's), the stored row is UPDATED, and
  the render is patched — so the full conversation appears now and stays fixed. Capped per load.
- `findReceivedEmailIdByMessageId` (`lib/email.ts`) — the LIST-by-Message-ID resolver for legacy
  rows that never stored a provider id.

## 2. Tenancy leaks closed

| # | Finding | Fix |
|---|---|---|
| **F1 · HIGH** | Inbound-email fallback (`matchContactByEmail`, flat-inbox replies with no reply-token) resolved the contact **unscoped, newest-row-wins** → a platform member's reply could bind to whichever tenant Space captured them last (cross-tenant timeline misattribution). | The PRIMARY (root/platform) lane now wins when it exists, else the newest tenant row; the real lane-precise path is the spine reply-token. `lib/crm/inbox.ts`. |
| **F3 · MED-HIGH** | Anonymous support-chat contact resolution (`resolveOrCreateContactId`) was unscoped newest-first → a visitor whose email is a tenant lead got the platform chat bound to the tenant CRM row. | Pinned to the platform lane (root space id or NULL). `lib/comms/support-chat.ts`. |
| **F4 · MED** | `contacts_space_read` RLS = `is_space_member` → any plain member could client-read their Space's whole contact book (emails, consent, at-risk scores). | Tightened to `can_write_space_content` (operator set) + platform staff. Migration `20261215000000` (applied + verified). Verified zero user-client `.from('contacts')` readers, so nothing legitimate breaks. |

## 3. Owner rulings

- **F2 · DM bodies in the CRM timeline — ✅ RESOLVED (owner ruling 2026-07-25: STRIP).**
  Member-to-member messaging is not CRM content. `recordDmTouch` now records the touch only
  (summary "Messaged", `body: null`) and never the message text; migration
  `20261216000000_scrub_dm_bodies_from_crm.sql` cleared the historical rows (applied + verified: 0
  DM bodies remain). The person-timeline still shows THAT a message happened, never its contents.
- **F5 · Platform-staff cross-lane lens — ✅ RULED + implemented (owner, 2026-07-25).** The ruling:
  tenant lanes stay SEALED except to **web_role admin and janitor**. Implemented in the platform
  Conversations workspace: a caller admitted via the marketing team-staff domain now sees the
  PLATFORM lane only (`platformLaneOnly` in `lib/comms/workspace.ts` — list, counts, and the
  by-id thread read all collapse to `space_id` null/root), and every write action
  (reply/triage/Vera seams) re-checks the seal server-side (`tenantLaneSealed`,
  `app/(main)/admin/crm/conversations/actions.ts`). Web_role admin/janitor keep the full
  cross-lane lens, ratified as the superset root. The legacy flat inbox rides the
  flat-inbox→spine migration (below) rather than growing its own seal.

## 4. Cohesion gaps (follow-ups, scoped)

- **F6** — Space 1:1 console sends (`startSpaceConversationAction`) gate on the PLATFORM consent
  scope + global-only suppression and skip the tenant's own `consent_state` / per-space suppression /
  topic mute (which the Space *campaign* path checks). A per-space unsubscribe doesn't stop a 1:1
  send. The two generations also disagree on the reply category (`marketing` vs `transactional`).
- **F7** — Pre-tenancy stragglers that fail CLOSED (no leak, but degrade as tenancy data accrues):
  `lib/ai/vera/today.ts`, `lib/dashboard/scores.ts` (subject_id→profile_id stitch empties for tenant
  rows), and `spaces/[slug]/crm/inbox-actions.ts` (space flat-inbox reply requires `profileId`, which
  tenant rows never carry → "isn't a member yet" for tenant contacts).
- **Parity guard blind spot** — the two **flat-inbox** surfaces are an older generation (hand-rolled
  `bodyToHtml`, no shared `renderReplyEmail`/signature/reply-address/batching, `marketing` category),
  not covered by `check:crm-parity`. Migrating flat-inbox replies onto the spine reply-token would
  also fix F1's root cause and F6's category divergence.

## 5. Safeties that hold (verified)

Per-space unique index + duplicate guard + root-pinning trigger; the membrane law in code
(`mayClaimSpace`, `ensureSpaceMemberContact` refuse root re-tag); spine lane scoping on all 4
`openOrGetConversation` callers; hard `conv.spaceId === gate.spaceId` on Space reply/note/triage/all
Vera seams + team-only assignment; leader owns-or-assigned on every action + thread read; Space
timeline/person reads strict `eq('space_id')`; unforgeable HMAC reply tokens (no cross-thread
enumeration; forged tokens drop, never fall back to contact-match); automated-mail loop guard +
`external_message_id` dedup; `comms_*` + `contact_interactions` RLS with no client write path;
per-space topic mutes + intentional global STOP; campaign sends rigorously root-lane.

---

*Owner: Daniel (Vision Steward). Audit + fixes 2026-07-25. F2/F5 await an owner ruling; F6/F7 +
the flat-inbox→spine migration are scoped follow-ups.*
