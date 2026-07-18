'use server'

// Server action for the Resonance CRM 2-way Inbox (ADR-629): reply to a contact conversation with an
// outbound email. The reply routes through the SAME gated send path Message Member uses — it resolves
// the send gate (lib/comms/send-gate.ts) and, on pass, enqueues onto the durable outbox
// (enqueueEmail) — so consent / suppression / preferences are honored and it never bypasses the gate.
// After enqueuing it records the outbound touch on the ONE timeline (recordContactInteraction) so the
// reply shows in the thread. Staff-gated; re-checks the gate the page uses on every call.

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { SITE_URL } from '@/lib/site'
import { resolveSendGate, type SendGateReason } from '@/lib/comms/send-gate'
import { recordContactInteraction } from '@/lib/crm/interactions'
import { getContactSendTarget } from '@/lib/crm/inbox'

const GATE = { min: 'janitor', staff: 'marketing' } as const

// A plain, in-voice line per gate block reason (docs/CONTENT-VOICE.md: no em dashes, skeptic-proof).
const GATE_REASON_COPY: Record<SendGateReason, string> = {
  ok: '',
  suppressed: "This address has bounced or marked us as spam, so we can't email it.",
  no_consent: "This person hasn't opted in to email, so we can't send.",
  pref_off: 'This person turned this kind of email off.',
  subject_muted: 'This person muted this topic.',
  frequency_deferred: 'This person is on a digest, so this will go out with their next batch.',
  frequency_cap: "This person is at their email limit for now. Try again later.",
  error: "Something went wrong checking their preferences. Try again in a moment.",
}

/**
 * Send an outbound email reply to a contact's conversation. Gated end to end:
 *   1. staff gate (the page's gate, re-checked here).
 *   2. resolve the contact's email + linked member profile.
 *   3. resolveSendGate(profileId, 'email', 'marketing', { email }) — the same gate Message Member uses.
 *   4. on pass: enqueueEmail (durable outbox, never inline) + record the outbound touch on the timeline.
 * FAIL-CLOSED: a contact with no linked member profile has no consent record, so we do not send.
 */
export async function sendInboxReplyAction(input: {
  contactId: string
  subject: string
  body: string
}): Promise<ActionResult> {
  const { profileId: operatorId } = await requireAdmin(GATE.min, { staff: GATE.staff })

  const contactId = (input.contactId ?? '').trim()
  const subject = (input.subject ?? '').trim().slice(0, 200)
  const body = (input.body ?? '').trim()
  if (!contactId) return fail('Pick a conversation first.')
  if (!subject) return fail('Add a subject line.')
  if (!body) return fail('Write a reply first.')

  const target = await getContactSendTarget(contactId)
  if (!target || !target.email) return fail('We have no email address for this contact.')
  // Consent lives on the member profile. A pure lead has no profile and no consent record, so we
  // fail-closed rather than email someone whose preferences we can't check.
  if (!target.profileId) {
    return fail("This contact isn't a member yet, so we can't check their email consent. Reach them another way.")
  }

  const gate = await resolveSendGate(target.profileId, 'email', 'marketing', { email: target.email })
  if (!gate.allowed) return fail(GATE_REASON_COPY[gate.reason] || 'This send is blocked.')

  // Enqueue through the SAME durable outbox the campaign / message-member path uses. Include the
  // one-click unsubscribe headers (RFC 8058) like every bulk-eligible send.
  const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl: SITE_URL, profileId: target.profileId, category: 'lifecycle' })
  const html = bodyToHtml(body)
  try {
    await enqueueEmail({
      to: target.email,
      subject,
      html,
      text: body,
      headers: listUnsubscribeHeaders(unsubscribeUrl),
    })
  } catch {
    return fail('Could not queue the email. Try again.')
  }

  // Record the outbound touch on the ONE timeline so it shows in the thread. The send path does not do
  // this for platform email, so we do it here (mirrors the manual-touch + DM recorders). Fail-safe.
  await recordContactInteraction(
    {
      ownerProfileId: operatorId,
      subjectKind: 'contact',
      subjectId: contactId,
      channel: 'email',
      direction: 'outbound',
      summary: subject,
      body,
      source: 'manual',
      idempotencyKey: `inbox-reply:${contactId}:${Date.now()}`,
    },
    target.spaceId,
  )

  revalidatePath('/admin/crm/inbox')
  return ok()
}

/** Turn a plain-text reply into minimal, safe HTML (escaped, newlines to <br>). No external template. */
function bodyToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  // token-ok: inline style in a server-rendered HTML message body (no CSS vars available)
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">${escaped.replace(/\n/g, '<br>')}</div>`
}
