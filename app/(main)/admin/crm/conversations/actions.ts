'use server'

// Server actions for the unified Conversation Workspace (ADR-812, Phase 3). These write to the comms_*
// spine (the system of record): a staff reply or internal note, and the triage controls (status /
// priority / assignee, with an assignment-audit row on a handoff). Staff-gated on every call with the
// same gate the page uses. Outbound replies go through the durable outbox (enqueueEmail) with the
// per-conversation Reply-To so the member's reply threads straight back (ADR-812 Phase 2), and drop
// List-Unsubscribe because a 1:1 human reply is transactional, not bulk.

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { isStaff } from '@/lib/core/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { enqueueEmail } from '@/lib/email'
import { resolveSendGate, type SendGateReason } from '@/lib/comms/send-gate'
import { buildConversationReplyAddress } from '@/lib/comms/reply-address'
import {
  getConversationById,
  appendConversationMessage,
  updateConversationFields,
  recordAssignment,
  newConversationMessageId,
  type AppendMessageInput,
} from '@/lib/comms/conversations'
import { conversationBatchWindowMinutes, queueOutboundMessage } from '@/lib/comms/outbound-batch'
import { resolveSignature } from '@/lib/comms/signature'
import { renderReplyEmail } from '@/lib/comms/email-template'
import { type ConversationPriority } from '@/lib/comms/labels'
import { veraDraftReply, veraSummarize, veraSuggestTriage } from '@/lib/comms/vera-conversation'

const GATE = { min: 'janitor', staff: 'marketing' } as const

/** F5 SEAL (owner ruling 2026-07-25): a tenant Space's conversation may be read/written through THIS
 *  platform workspace only by web_role admin/janitor. A caller admitted via the marketing staff domain
 *  is limited to the PLATFORM lane (space_id null or the root space). Returns true when sealed. */
async function tenantLaneSealed(webRole: string | null | undefined, spaceId: string | null): Promise<boolean> {
  if (!spaceId) return false
  if (isStaff(webRole as Parameters<typeof isStaff>[0])) return false
  const { loadRootSpaceId } = await import('@/lib/spaces/store')
  return spaceId !== (await loadRootSpaceId())
}
const SEALED_COPY = "That conversation belongs to a Space's own CRM and needs the admin lens."


const GATE_REASON_COPY: Record<SendGateReason, string> = {
  ok: '',
  suppressed: "This address has bounced or marked us as spam, so we can't email it.",
  no_consent: "This person hasn't opted in to email, so we can't send.",
  pref_off: 'This person turned this kind of email off.',
  subject_muted: 'This person muted this topic.',
  frequency_deferred: 'This person is on a digest, so this will go out with their next batch.',
  frequency_cap: 'This person is at their email limit for now. Try again later.',
  error: 'Something went wrong checking their preferences. Try again in a moment.',
}

/** The conversational sending identity (a separate subdomain so 1:1 mail never rides bulk reputation). */
function conversationFrom(senderName: string | null): string {
  const addr = process.env.EMAIL_CONVERSATION_FROM ?? process.env.EMAIL_FROM ?? 'people@people.frequencylocal.com'
  const name = (senderName ?? 'Frequency').replace(/["\\<>]/g, '').trim() || 'Frequency'
  return `${name} via Frequency <${addr}>`
}

/** A profile's display name (for the "trail of senders" From line). Fail-safe: null. */
async function profileName(profileId: string): Promise<string | null> {
  try {
    const db = createAdminClient() as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data } = await db.from('profiles').select('display_name').eq('id', profileId).maybeSingle()
    return (data?.display_name as string) ?? null
  } catch {
    return null
  }
}

/**
 * Reply to a conversation, or file an internal note. A note is appended and nothing is emailed. A public
 * reply: gate consent (when the counterpart is a member), enqueue the outbound email with the
 * per-conversation Reply-To + Message-ID, append the outbound message (mirrored to the CRM timeline), and
 * flip an open thread to `waiting` (mirrors support). Staff-gated.
 */
export async function sendConversationReply(input: {
  conversationId: string
  body: string
  isInternal?: boolean
}): Promise<ActionResult> {
  const { profileId: operatorId, webRole } = await requireAdmin(GATE.min, { staff: GATE.staff })
  const conversationId = (input.conversationId ?? '').trim()
  const body = (input.body ?? '').trim()
  if (!conversationId) return fail('Pick a conversation first.')
  if (!body) return fail(input.isInternal ? 'Write a note first.' : 'Write a reply first.')

  const conv = await getConversationById(conversationId)
  if (!conv) return fail('That conversation no longer exists.')
  if (await tenantLaneSealed(webRole, conv.spaceId)) return fail(SEALED_COPY)

  // INTERNAL NOTE: staff-only, never emailed, never mirrored to the member timeline.
  if (input.isInternal) {
    const noted = await appendConversationMessage({
      conversationId,
      direction: 'internal',
      authorKind: 'staff',
      authorId: operatorId,
      body,
      isInternal: true,
    })
    if (!noted) return fail('Could not save the note. Try again.')
    revalidatePath('/admin/crm/conversations')
    return ok()
  }

  // PUBLIC REPLY.
  if (!conv.externalEmail) return fail('We have no email address for this conversation.')
  // A 1:1 human reply inside an active conversation is TRANSACTIONAL, not a marketing blast — the member (or
  // lead) is in a conversation with us, so they are opted in by that context. We gate it as `transactional`,
  // which sends past preferences/consent and is stopped ONLY by the hard suppression list (a bounced or
  // spam-flagged address is undeliverable — the one block we never override).
  if (conv.memberProfileId) {
    const gate = await resolveSendGate(conv.memberProfileId, 'email', 'transactional', { email: conv.externalEmail })
    if (!gate.allowed) return fail(GATE_REASON_COPY[gate.reason] || 'This send is blocked.')
  }

  const senderName = await profileName(operatorId)
  const signature = await resolveSignature(operatorId, senderName)
  const subject = replySubject(conv.subject)
  const from = conversationFrom(senderName)
  const storedHtml = bodyToHtml(body) // clean body for the thread + CRM mirror (no header/footer/signature)
  const mirror: AppendMessageInput['mirror'] =
    conv.ownerProfileId && (conv.memberProfileId || conv.contactId)
      ? {
          ownerProfileId: conv.ownerProfileId,
          subjectKind: conv.memberProfileId ? 'profile' : 'contact',
          subjectId: (conv.memberProfileId ?? conv.contactId)!,
          spaceId: conv.spaceId,
          subject,
        }
      : null

  if (conversationBatchWindowMinutes() > 0) {
    // BATCH MODE: hold this reply as a queued message; the flush cron coalesces the burst into one email.
    const queued = await queueOutboundMessage({
      conversationId,
      from,
      to: conv.externalEmail,
      body,
      html: storedHtml,
      signature,
      authorKind: 'staff',
      authorId: operatorId,
      mirror,
    })
    if (!queued) return fail('Could not queue the reply. Try again.')
  } else {
    // IMMEDIATE (default): send the branded, signed email now (header/footer + signature), then record the
    // CLEAN outbound message (no chrome) on the thread + CRM timeline.
    const { html: emailHtml, text: emailText } = renderReplyEmail(body, signature)
    const messageId = newConversationMessageId(conv.ref)
    try {
      await enqueueEmail({
        to: conv.externalEmail,
        from,
        replyTo: buildConversationReplyAddress(conv.ref),
        subject,
        html: emailHtml,
        text: emailText,
        // No List-Unsubscribe: a 1:1 human reply is transactional, not bulk (ADR-812 deliverability).
        headers: { 'Message-ID': messageId },
      })
    } catch {
      return fail('Could not queue the reply. Try again.')
    }
    await appendConversationMessage({
      conversationId,
      direction: 'outbound',
      authorKind: 'staff',
      authorId: operatorId,
      body,
      bodyHtml: storedHtml,
      externalMessageId: messageId,
      mirror,
    })
  }

  // A public reply moves an active thread to "waiting" (on the member), mirroring support.
  if (conv.status === 'open' || conv.status === 'in_progress') {
    await updateConversationFields(conversationId, { status: 'waiting' })
  }

  revalidatePath('/admin/crm/conversations')
  return ok()
}

/**
 * Triage a conversation: change status / priority / assignee. A change of assignee also writes an
 * append-only assignment-audit row (the "trade" trail) and, when a handoff note is supplied, files it as
 * an internal note so the new assignee has context. Staff-gated.
 */
export async function setConversationTriage(input: {
  conversationId: string
  status?: string
  priority?: string
  assignedTo?: string | null
  handoffNote?: string | null
}): Promise<ActionResult> {
  const { profileId: operatorId, webRole } = await requireAdmin(GATE.min, { staff: GATE.staff })
  const conversationId = (input.conversationId ?? '').trim()
  if (!conversationId) return fail('Pick a conversation first.')

  const conv = await getConversationById(conversationId)
  if (!conv) return fail('That conversation no longer exists.')
  if (await tenantLaneSealed(webRole, conv.spaceId)) return fail(SEALED_COPY)

  const patch: { status?: string; priority?: string; assignedTo?: string | null } = {}
  if (input.status && input.status !== conv.status) patch.status = input.status
  if (input.priority) patch.priority = input.priority
  const assigneeChanged = input.assignedTo !== undefined && (input.assignedTo || null) !== conv.assignedTo
  if (assigneeChanged) patch.assignedTo = input.assignedTo || null

  if (Object.keys(patch).length === 0) return ok() // nothing to change

  const okUpdate = await updateConversationFields(conversationId, patch)
  if (!okUpdate) return fail('Could not update the conversation. Try again.')

  if (assigneeChanged) {
    await recordAssignment({
      conversationId,
      assignedTo: input.assignedTo || null,
      assignedBy: operatorId,
      reason: 'manual',
    })
    const note = (input.handoffNote ?? '').trim()
    if (note) {
      await appendConversationMessage({
        conversationId,
        direction: 'internal',
        authorKind: 'staff',
        authorId: operatorId,
        body: note,
        isInternal: true,
      })
    }
  }

  revalidatePath('/admin/crm/conversations')
  return ok()
}

// ── Vera seams (ADR-812 Phase 5) — quiet, optional AI affordances. Thin, staff-gated wrappers over the ONE
// shared conversation-AI (lib/comms/vera-conversation), so the platform and every per-Space CRM run the
// exact same drafting / summary / triage logic. Every output lands in a human-editable or reversible field;
// a human still runs the gated Send / triage.

/** Draft a reply with Vera — thin wrapper over the shared conversation-AI (lib/comms/vera-conversation),
 *  so the platform and every Space call the exact same logic. Staff-gated. */
export async function draftConversationReply(conversationId: string): Promise<ActionResult<{ draft: string }>> {
  const { profileId, webRole } = await requireAdmin(GATE.min, { staff: GATE.staff })
  const conv = await getConversationById((conversationId ?? '').trim())
  if (conv && (await tenantLaneSealed(webRole, conv.spaceId))) return fail(SEALED_COPY)
  return veraDraftReply((conversationId ?? '').trim(), profileId)
}

/** One short summary of the thread (shared logic). Staff-gated. */
export async function summarizeConversation(conversationId: string): Promise<ActionResult<{ summary: string }>> {
  const { profileId, webRole } = await requireAdmin(GATE.min, { staff: GATE.staff })
  const conv = await getConversationById((conversationId ?? '').trim())
  if (conv && (await tenantLaneSealed(webRole, conv.spaceId))) return fail(SEALED_COPY)
  return veraSummarize((conversationId ?? '').trim(), profileId)
}

/** Suggest + apply a priority (shared logic; persists reversibly). Staff-gated. */
export async function suggestConversationTriage(
  conversationId: string,
): Promise<ActionResult<{ priority: ConversationPriority; reason: string }>> {
  const { profileId, webRole } = await requireAdmin(GATE.min, { staff: GATE.staff })
  const conv = await getConversationById((conversationId ?? '').trim())
  if (conv && (await tenantLaneSealed(webRole, conv.spaceId))) return fail(SEALED_COPY)
  const r = await veraSuggestTriage((conversationId ?? '').trim(), profileId)
  revalidatePath('/admin/crm/conversations')
  return r
}

/** `Re:`-prefix the subject once (mirrors the CRM inbox composer). */
function replySubject(subject: string | null): string {
  const s = (subject ?? '').trim() || '(no subject)'
  return s.toLowerCase().startsWith('re:') ? s.slice(0, 200) : `Re: ${s}`.slice(0, 200)
}

/** Plain-text reply → minimal safe HTML (escaped, newlines to <br>). No external template. */
function bodyToHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // token-ok: inline style in a server-rendered HTML message body (no CSS vars available in email)
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">${escaped.replace(/\n/g, '<br>')}</div>`
}
