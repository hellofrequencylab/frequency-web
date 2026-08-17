# Chat consolidation — one messaging function, site-wide

> **Status lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json)** — run `pnpm backlog`.
> This document is the spec and the rationale. It does **not** record what is done, because prose
> cannot be verified and this repo has lost that bet five times ([ADR-1043](DECISIONS.md)).

> Owner directive (2026-07-25): combine the two chat instances (the public "Chat with us" → CRM, and
> the member-area dock) into ONE box site-wide. De-emphasize "talk to a human" — make it a **send-us-a-
> message / support-request form**, not a live-response widget. Once started, a request shows as a
> **ticketed conversation in the sender's own inbox**. On public pages: lead with **Contact us**, and
> make the member section a **log in / register** prompt.

## The problem (from the deep surface scan)

THREE disconnected messaging systems:

| System | Store | Member sees it? | Entry |
|---|---|---|---|
| A. Support tickets (ADR-159) | `support_tickets` / `support_ticket_messages` | ✅ `/support` | ReportDialog (signed-in) |
| B. Comms spine (ADR-812/816) | `comms_conversations` / `comms_messages` | ❌ **no member UI** (RLS exists, unused) | anon live-chat widget |
| C. Member DMs | `conversations` / `rooms` | ✅ `/messages` | dock "Messages" tab |

The anon widget (B) wrote a **contact-based** conversation with `member_profile_id = null`, so even a
signed-in member could never see their own support thread — and their only visible support surface
(`/support`) reads a different table (A). The two never met.

## The design — consolidate on the spine (System B)

Anon visitors, signed-in members, and operators all live in ONE system (the comms spine + the CRM
Conversations workspace the operator already uses). A submitted request is a ticketed conversation the
sender can see and reply to in their own inbox.

## Phases

| # | Phase | Status |
|---|---|---|
| **1** | **Member-binding** — a signed-in sender's support request binds to `member_profile_id` (`subject_kind:'profile'`, kind `support`), authored as the member; anon stays contact-based. `startSupportChat` resolves the member's own name/email. | ✅ shipped |
| **2** | **Member inbox** — `lib/comms/member-support.ts` (RLS-scoped reader + ownership-checked reply) + authed actions + `SupportConversationsPanel` in the dock's Help & support section: "Send us a message" composer → the request threads back as a ticketed conversation the member reads + replies to. Operator answers in CRM Conversations; the reply lands here. | ✅ shipped |
| **3** | **Unified public shell** — one auth-aware dock component replacing the standalone `SupportChatWidget`: public pages lead with the Contact-us form; the member section (Messages/Vera) becomes a **log in / register** prompt (`/sign-in?next=`, the `detectClientAuth` + `getSession()` pattern). Retire the separate widget box; keep every `open-*` event. | 📋 next |
| **4** | **De-emphasize live** — the entry is submit → confirmation (no auto-Broadcast socket); the live channel + typing spin up only when a thread is explicitly opened. Copy pass (voice canon). | 📋 next |

Phases 1–2 close the concrete gap (a member can now send a support request and see/reply to it in
their inbox, operator-answerable). Phases 3–4 are the public-shell unification + the live→form shift.

## Invariants

- Reads via the USER client (RLS `member_profile_id = get_my_profile_id()`); the reply write re-checks
  ownership in code before the shared spine append (admin client) — mirrors + threads like any channel.
- The anon path is unchanged (contact-based, kind `crm`); only the signed-in path is new.
- `check:crm-parity` / `check:authz` / `check:tokens` stay green; no em dashes in member copy.
- System A (`/support` tickets + `/admin/support`) is left intact; the spine is the consolidation
  target, and a later pass can fold A's remaining entry points (Report-a-bug) onto it or keep bugs on A.

---

*Owner: Daniel (Vision Steward). Created 2026-07-25 from the chat/support surface scan. Phases 1–2
shipped; 3–4 next.*
