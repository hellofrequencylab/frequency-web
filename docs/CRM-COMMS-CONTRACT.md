# The CRM / comms contract — one suite, every surface identical

**Status:** Locked 2026‑07‑25 (ADR‑817). This is the standard for the unified ticketed communication
suite (ADR‑812). It is **machine‑enforced** (`pnpm check:crm-parity` + a drift‑guard test in CI), so an
edit to the shared behavior applies to the platform CRM and every tenant Space at once — and a per‑surface
fork fails the build, including one written by an AI agent. Extend the shared modules; do not fork them.

## The one rule

**Every CRM conversation surface — the platform Resonance CRM, every per‑Space tenant CRM, and the leader
inbox — composes the SAME shared comms modules. No surface re‑implements Vera, the branded email, the
signature, or the outbound send.** Each surface is a thin adapter: it runs its own gate (staff / space‑manage
+ tenancy / owner), resolves the acting `profileId` and a tenancy‑checked `conversationId`, and hands those
to the shared function. The logic lives in one place; the surfaces differ only by who is allowed in.

## The three surfaces (must stay in lock‑step)

| Surface | File | Gate |
| :--- | :--- | :--- |
| Platform Resonance CRM | `app/(main)/admin/crm/conversations/actions.ts` | `requireAdmin` (staff) |
| Per‑Space tenant CRM | `app/(main)/spaces/[slug]/crm/conversations-actions.ts` | space‑manage + hard tenancy on `space_id` |
| Leader inbox | `app/(main)/lead/inbox/actions.ts` | `requireLeadFloor` + owns‑or‑assigned |

Adding a **new** CRM conversation surface means adding it to `SURFACES` in
`scripts/check-crm-parity.mjs` **and** wiring it to every shared module below. That is the contract — a new
surface is not "done" until the guard covers it.

## The shared modules (never re‑implement these)

```
   lib/comms/vera-conversation.ts   veraDraftReply · veraSummarize · veraSuggestTriage   (the Vera AI)
   lib/comms/email-template.ts      renderReplyEmail / wrapEmailHtml                      (branded header/footer body)
   lib/comms/signature.ts           resolveSignature                                      (per‑sender editable signature)
   lib/comms/outbound-batch.ts      queueOutboundMessage / flush*                          (batch/digest outbound)
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
   PLATFORM  admin/crm/…/actions.ts   SPACE  spaces/[slug]/crm/…-actions.ts   LEADER  lead/inbox/actions.ts
        (requireAdmin)                     (space‑manage + tenancy)                 (requireLeadFloor + owns)
```

- **Vera AI** (`veraDraftReply` / `veraSummarize` / `veraSuggestTriage`) — the prompts, budget guards,
  model call, and triage parsing live ONLY in `lib/comms/vera-conversation.ts`. A surface calls them after
  its gate; it never holds its own prompt text.
- **Branded email body** — every outbound reply is rendered by `renderReplyEmail` (Frequency header/footer
  via `wrapEmailHtml`) so the look is identical everywhere. The clean, chrome‑free body is what's stored on
  the thread + CRM timeline; the chrome rides only on the email.
- **Signature** — `resolveSignature(profileId, name)` reads the sender's saved signature (or the default),
  so a signature edit applies to every surface that sender uses.
- **Outbound send** — `queueOutboundMessage` (batch mode) is the single queue path; the shared flush cron
  coalesces a burst into one email. Immediate sends still go through `renderReplyEmail` + the durable
  `enqueueEmail` outbox.

The shared `ConversationWorkspace` (`components/admin/crm/conversation-workspace.tsx`) is the ONE UI; each
page injects its gated actions via `draftAction` / `summarizeAction` / `aiTriageAction` / `sendAction` /
`triageAction`. Injection, not a per‑surface component.

## What is enforced, and how

`scripts/check-crm-parity.mjs` (run by `pnpm check:crm-parity` in CI, and asserted by
`scripts/check-crm-parity.test.ts` under `pnpm test`) fails the build when:

1. **A surface drops a shared import** — any of the three `SURFACES` stops importing `veraDraftReply` /
   `veraSummarize` / `veraSuggestTriage`, `renderReplyEmail`, `resolveSignature`, or `queueOutboundMessage`.
   That means it has begun re‑implementing shared logic.
2. **Shared logic is re‑inlined** — a Vera prompt sentinel appears in any file other than the shared module.
   Copy‑pasting the logic back into a surface is the drift this catches, regardless of file.

Both checks are static (no DB, no network), so they run in the normal CI lane alongside `check:menu`,
`check:canon`, and the others.

## The little‑tweak path (safe, local, applies everywhere)

- **Change how Vera drafts / summarizes / triages** → edit `lib/comms/vera-conversation.ts`. All three
  surfaces change together.
- **Change the email chrome / signature / batching** → edit `email-template.ts` / `signature.ts` /
  `outbound-batch.ts`. Same.
- **Change who may do it on a surface** → edit that surface's gate only. The shared logic is untouched.
- **Add a brand‑new surface** → add it to `SURFACES` in the guard and wire it to every shared module.

## Anti‑patterns (the guard rejects these)

- A new prompt string inlined in a page/action instead of `vera-conversation.ts`.
- A surface hand‑rolling its own email HTML instead of `renderReplyEmail`.
- A second "branded template" or signature resolver parallel to the shared ones.
- A fourth CRM surface added without registering it in the guard.

If you think you need one of these, you don't — extend the shared module, or add a gate. See ADR‑817 in
`docs/DECISIONS.md`.
