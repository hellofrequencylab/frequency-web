// The Vera autonomous-send GRADUATION path (ADR — Vera autonomous-send graduation).
//
// This is the ONLY function that turns a Vera-decided send into a real, autonomous send. It routes
// through BOTH gates, in order, and can never go around either:
//
//   1. the CIRCUIT BREAKER (kill switch + rate caps + anomaly trip), then
//   2. `resolveSendGate` (consent + suppression + preference).
//
// The enqueue call is textually reachable ONLY after BOTH gates return `allowed`. If the breaker or
// the send-gate blocks — or anything throws — the request FALLS BACK to the existing propose (human-
// approval) path, and NEVER silently sends. Fail-closed everywhere.
//
// The pure decision (which gate to consult, and what to do with each outcome) is small and lives here;
// all IO is injected via `deps` so the graduation predicate is unit-testable without a database.

import { resolveSendGate, type SendCategory } from '@/lib/comms/send-gate'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { createAdminClient } from '@/lib/supabase/admin'
import { type AutonomyCategory } from './autonomy-config'
import {
  AUTONOMOUS_SEND_TAG,
  checkCircuitBreaker,
  recordAutonomyDecision,
  type AutonomyAuditEntry,
} from './circuit-breaker'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

export interface AutonomousSendInput {
  category: AutonomyCategory
  recipientProfileId: string
  /** The recipient's deliverable address; null → cannot really send (falls back to propose). */
  recipientEmail: string | null
  /** The send-gate category (consent scope) this send needs. */
  sendCategory: SendCategory
  subject: string
  body: string
  /** Why Vera decided to send — recorded on the audit + carried into the proposal on fallback. */
  rationale: string
  /** Extra context for the proposal + audit (e.g. contactId, otherProfileId, playbookId). */
  metadata?: Record<string, unknown>
}

export type AutonomousSendOutcome =
  | { status: 'sent' }
  | { status: 'proposed'; reason: string } // fell back to human approval (breaker/gate blocked, or error)
  | { status: 'blocked'; reason: string } // could not even propose (a propose write failed) — still never sent

/** Injectable IO, so the graduation predicate is testable in isolation. Defaults wire the real seams. */
export interface AutonomousSendDeps {
  checkBreaker: typeof checkCircuitBreaker
  runSendGate: typeof resolveSendGate
  enqueue: typeof enqueueEmail
  /** The propose (human-approval) fallback: records the send as a proposed action for review. */
  propose: (input: AutonomousSendInput, blockedReason: string) => Promise<void>
  audit: (entry: AutonomyAuditEntry) => Promise<void>
}

const defaultDeps: AutonomousSendDeps = {
  checkBreaker: checkCircuitBreaker,
  runSendGate: resolveSendGate,
  enqueue: enqueueEmail,
  propose: proposeAutonomousSend,
  audit: recordAutonomyDecision,
}

/**
 * Run the graduation. BREAKER → SEND-GATE → enqueue, or fall back to propose. The invariant: the
 * enqueue below is reached ONLY when both gates allowed; every other path proposes (never sends).
 */
export async function autonomousSend(
  input: AutonomousSendInput,
  deps: Partial<AutonomousSendDeps> = {},
): Promise<AutonomousSendOutcome> {
  const d: AutonomousSendDeps = { ...defaultDeps, ...deps }
  try {
    // GATE 1 — the circuit breaker (kill switch + rate caps + anomaly trip). Fail-closed.
    const breaker = await d.checkBreaker({ category: input.category, recipientEmail: input.recipientEmail })
    if (!breaker.allowed) {
      return fallbackToPropose(input, `breaker:${breaker.reason}`, { breakerReason: breaker.reason, gateReason: null }, d)
    }

    // GATE 2 — the unified send-gate (consent + suppression + preference). Fail-closed.
    const gate = await d.runSendGate(
      input.recipientProfileId,
      'email',
      input.sendCategory,
      input.recipientEmail ? { email: input.recipientEmail } : {},
    )
    if (!gate.allowed) {
      return fallbackToPropose(input, `gate:${gate.reason}`, { breakerReason: 'ok', gateReason: gate.reason }, d)
    }

    // A real autonomous send needs a deliverable address. Without one, we cannot send → propose.
    if (!input.recipientEmail) {
      return fallbackToPropose(input, 'no_email', { breakerReason: 'ok', gateReason: 'no_email' }, d)
    }

    // BOTH gates clear → the one and only autonomous enqueue. Tagged so the rate-cap counter sees it.
    const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl: BASE_URL, profileId: input.recipientProfileId, category: 'lifecycle' })
    await d.enqueue({
      to: input.recipientEmail,
      subject: input.subject,
      html: autonomousEmailHtml(input.body, unsubscribeUrl),
      text: `${input.body}\n\nUnsubscribe or manage emails: ${unsubscribeUrl}`,
      headers: listUnsubscribeHeaders(unsubscribeUrl),
      tags: [{ name: AUTONOMOUS_SEND_TAG, value: input.category }],
    })
    await d.audit(auditEntry(input, 'sent', { breakerReason: 'ok', gateReason: 'ok' }))
    return { status: 'sent' }
  } catch {
    // Fail-closed: never send on an unexpected error. Fall back to propose so nothing is lost.
    return fallbackToPropose(input, 'error', { breakerReason: 'config_error', gateReason: null }, d)
  }
}

/** Record the audit, then hand the send to the propose (human-approval) path. Never sends. */
async function fallbackToPropose(
  input: AutonomousSendInput,
  reason: string,
  reasons: { breakerReason: AutonomyAuditEntry['breakerReason']; gateReason: string | null },
  d: AutonomousSendDeps,
): Promise<AutonomousSendOutcome> {
  try {
    await d.propose(input, reason)
    await d.audit(auditEntry(input, 'proposed', reasons))
    return { status: 'proposed', reason }
  } catch {
    // The proposal write itself failed — still never sent. Record the block best-effort.
    try {
      await d.audit(auditEntry(input, 'blocked', reasons))
    } catch {
      /* audit is best-effort */
    }
    return { status: 'blocked', reason }
  }
}

function auditEntry(
  input: AutonomousSendInput,
  outcome: AutonomyAuditEntry['outcome'],
  reasons: { breakerReason: AutonomyAuditEntry['breakerReason']; gateReason: string | null },
): AutonomyAuditEntry {
  return {
    category: input.category,
    recipientProfileId: input.recipientProfileId,
    recipientEmail: input.recipientEmail,
    outcome,
    breakerReason: reasons.breakerReason,
    gateReason: reasons.gateReason,
    rationale: input.rationale,
    metadata: input.metadata,
  }
}

/** Default propose: record the send as a proposed `agent_actions` row for one-tap human approval. */
async function proposeAutonomousSend(input: AutonomousSendInput, blockedReason: string): Promise<void> {
  const admin = createAdminClient() as unknown as {
    from: (t: string) => { insert: (row: Record<string, unknown>) => Promise<{ error: unknown }> }
  }
  const { error } = await admin.from('agent_actions').insert({
    kind: 'vera_autonomous_send',
    status: 'proposed',
    rationale: input.rationale,
    payload: {
      category: input.category,
      recipientProfileId: input.recipientProfileId,
      recipientEmail: input.recipientEmail,
      sendCategory: input.sendCategory,
      subject: input.subject,
      body: input.body,
      blockedReason,
      metadata: input.metadata ?? {},
    },
  })
  if (error) throw new Error(typeof error === 'string' ? error : 'Could not record the proposal.')
}

/** Minimal outbound shell (inline styles for mail-client compatibility, like the rest of lib/email).
 *  The decided subject/body carry the copy; escaped, newlines preserved. */
function autonomousEmailHtml(body: string, unsubscribeUrl: string): string {
  const safe = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px;"><p style="font-size:15px;color:#3D352A;line-height:1.65;">${safe}</p><hr style="border:none;border-top:1px solid #E9E1D4;margin:24px 0;"/><p style="font-size:12px;color:#8F8675;">You're receiving this as a Frequency member. <a href="${unsubscribeUrl}" style="color:#8F8675;">Unsubscribe or manage emails</a>.</p></div>`
}
