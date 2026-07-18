'use server'

// Space-scoped 2-way Inbox reply (ADR-786): the space-owner sibling of the admin
// `sendInboxReplyAction`. A space MANAGER (not platform staff) replies to a conversation with one of
// THEIR space's contacts. Same gated send pipeline as the admin inbox + Message Member
// (resolveSendGate → enqueueEmail → recordContactInteraction), so consent / suppression / preferences are
// always honored. TENANCY: the contact must belong to THIS space, so a manager can never reply into another
// space's conversation. The reply subject/body validation + the send pipeline mirror the admin action;
// only the GATE (space-manage instead of requireAdmin) and the tenancy check differ.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { SITE_URL } from '@/lib/site'
import { resolveSendGate, type SendGateReason } from '@/lib/comms/send-gate'
import { recordContactInteraction } from '@/lib/crm/interactions'
import { getContactSendTarget } from '@/lib/crm/inbox'

// In-voice line per gate block reason (docs/CONTENT-VOICE.md: no em dashes, skeptic-proof). Mirrors the
// admin action's copy; kept local because a 'use server' file can only export async server actions.
const GATE_REASON_COPY: Record<SendGateReason, string> = {
  ok: '',
  suppressed: "This address has bounced or marked us as spam, so we can't email it.",
  no_consent: "This person hasn't opted in to email, so we can't send.",
  pref_off: 'This person turned this kind of email off.',
  subject_muted: 'This person muted this topic.',
  frequency_deferred: 'This person is on a digest, so this will go out with their next batch.',
  frequency_cap: "This person is at their email limit for now. Try again later.",
  error: 'Something went wrong checking their preferences. Try again in a moment.',
}

/**
 * Send an outbound email reply to a contact's conversation, as a manager of `slug`. Gated end to end:
 *   1. SPACE-MANAGE gate (owner/admin/editor) — a staff previewer is read-only, so it cannot send.
 *   2. TENANCY: the contact's space must be this space.
 *   3. resolve email + linked member profile; fail-closed when there is no member consent record.
 *   4. resolveSendGate (the same consent gate Message Member uses) → on pass, enqueueEmail + record the
 *      outbound touch on the ONE timeline so it shows in the thread.
 * `slug` is bound server-side by the inbox page, so the client only passes { contactId, subject, body }.
 */
export async function sendSpaceInboxReplyAction(
  slug: string,
  input: { contactId: string; subject: string; body: string },
): Promise<ActionResult> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  if (!viewerProfileId) return fail('Sign in to reply.')

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return fail('We could not find that space.')
  const { canManage } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage) return fail('You do not manage this space.')

  const contactId = (input.contactId ?? '').trim()
  const subject = (input.subject ?? '').trim().slice(0, 200)
  const body = (input.body ?? '').trim()
  if (!contactId) return fail('Pick a conversation first.')
  if (!subject) return fail('Add a subject line.')
  if (!body) return fail('Write a reply first.')

  const target = await getContactSendTarget(contactId)
  if (!target || !target.email) return fail('We have no email address for this contact.')
  // TENANCY: never let a manager reply into a contact that is not in this space.
  if (target.spaceId !== space.id) return fail('That conversation is not in this space.')
  // Consent lives on the member profile. A pure lead has no profile and no consent record, so fail-closed.
  if (!target.profileId) {
    return fail("This contact isn't a member yet, so we can't check their email consent. Reach them another way.")
  }

  const gate = await resolveSendGate(target.profileId, 'email', 'marketing', { email: target.email })
  if (!gate.allowed) return fail(GATE_REASON_COPY[gate.reason] || 'This send is blocked.')

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

  await recordContactInteraction(
    {
      ownerProfileId: viewerProfileId,
      subjectKind: 'contact',
      subjectId: contactId,
      channel: 'email',
      direction: 'outbound',
      summary: subject,
      body,
      source: 'manual',
      idempotencyKey: `space-inbox-reply:${contactId}:${Date.now()}`,
    },
    target.spaceId,
  )

  revalidatePath(`/spaces/${slug}/crm/inbox`)
  return ok()
}

/** Turn a plain-text reply into minimal, safe HTML (escaped, newlines to <br>). No external template. */
function bodyToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  // token-ok: inline style in a server-rendered HTML email body (no CSS vars available)
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">${escaped.replace(/\n/g, '<br>')}</div>`
}
