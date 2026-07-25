'use server'

// Leader inbox actions (ADR-812 Phases 3b + 4). A community leader works the conversations on their own
// sender trail: reply as themselves, triage, and broadcast to their downline (which fans out into one
// tracked conversation per member). Gated by requireLeadFloor (host+), and every per-thread write also
// verifies the leader actually OWNS or is assigned that conversation, so a leader can never touch someone
// else's thread. Mirrors the operator actions; the difference is the gate + the ownership check +
// authorKind='leader'.

import { revalidatePath } from 'next/cache'
import { requireLeadFloor } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { enqueueEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { buildConversationReplyAddress } from '@/lib/comms/reply-address'
import {
  getConversationById,
  appendConversationMessage,
  updateConversationFields,
  recordAssignment,
  newConversationMessageId,
  type ConversationRow,
  type AppendMessageInput,
} from '@/lib/comms/conversations'
import { sendLeaderMessageToDownline } from '@/lib/comms/leader-send'
import { conversationBatchWindowMinutes, queueOutboundMessage } from '@/lib/comms/outbound-batch'
import { resolveSignature } from '@/lib/comms/signature'
import { renderReplyEmail } from '@/lib/comms/email-template'
import { type ConversationPriority } from '@/lib/comms/labels'
import { veraDraftReply, veraSummarize, veraSuggestTriage } from '@/lib/comms/vera-conversation'

/** Load the conversation and confirm the leader owns it (their sender trail) or is assigned it. */
async function ownedConversation(leaderId: string, conversationId: string): Promise<ConversationRow | null> {
  const conv = await getConversationById((conversationId ?? '').trim())
  if (!conv) return null
  if (conv.ownerProfileId !== leaderId && conv.assignedTo !== leaderId) return null
  return conv
}

async function profileName(profileId: string): Promise<string | null> {
  try {
    const db = createAdminClient() as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data } = await db.from('profiles').select('display_name').eq('id', profileId).maybeSingle()
    return (data?.display_name as string) ?? null
  } catch {
    return null
  }
}

function leaderFrom(name: string | null): string {
  const addr = process.env.EMAIL_CONVERSATION_FROM ?? process.env.EMAIL_FROM ?? 'people@people.frequencylocal.com'
  const clean = (name ?? 'Frequency').replace(/["\\<>]/g, '').trim() || 'Frequency'
  return `${clean} via Frequency <${addr}>`
}

function replySubject(subject: string | null): string {
  const s = (subject ?? '').trim() || '(no subject)'
  return s.toLowerCase().startsWith('re:') ? s.slice(0, 200) : `Re: ${s}`.slice(0, 200)
}

function bodyToHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // token-ok: inline style in a server-rendered HTML message body (no CSS vars available in email)
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">${escaped.replace(/\n/g, '<br>')}</div>`
}

/** Reply to (or note on) a conversation the leader owns, as themselves. */
export async function sendLeaderReply(input: {
  conversationId: string
  body: string
  isInternal?: boolean
}): Promise<ActionResult> {
  const { profileId: leaderId } = await requireLeadFloor()
  const body = (input.body ?? '').trim()
  if (!body) return fail(input.isInternal ? 'Write a note first.' : 'Write a reply first.')

  const conv = await ownedConversation(leaderId, input.conversationId)
  if (!conv) return fail('That conversation is not one of yours.')

  if (input.isInternal) {
    const noted = await appendConversationMessage({
      conversationId: conv.id,
      direction: 'internal',
      authorKind: 'leader',
      authorId: leaderId,
      body,
      isInternal: true,
    })
    if (!noted) return fail('Could not save the note. Try again.')
    revalidatePath('/lead/inbox')
    return ok()
  }

  if (!conv.externalEmail) return fail('We have no email address for this conversation.')
  if (conv.memberProfileId) {
    // A 1:1 reply in an active conversation is transactional — send unless the address is hard-suppressed.
    const gate = await resolveSendGate(conv.memberProfileId, 'email', 'transactional', { email: conv.externalEmail })
    if (!gate.allowed) return fail('This address has bounced or marked us as spam, so this reply cannot go out.')
  }

  const leaderName = await profileName(leaderId)
  const signature = await resolveSignature(leaderId, leaderName)
  const from = leaderFrom(leaderName)
  const subject = replySubject(conv.subject)
  const storedHtml = bodyToHtml(body) // clean body for the thread + CRM mirror
  const mirror: AppendMessageInput['mirror'] =
    conv.memberProfileId || conv.contactId
      ? {
          ownerProfileId: leaderId,
          subjectKind: conv.memberProfileId ? 'profile' : 'contact',
          subjectId: (conv.memberProfileId ?? conv.contactId)!,
          spaceId: conv.spaceId,
          subject,
        }
      : null

  if (conversationBatchWindowMinutes() > 0) {
    // BATCH MODE: hold this reply as a queued message; the flush cron coalesces the burst into one email.
    const queued = await queueOutboundMessage({
      conversationId: conv.id,
      from,
      to: conv.externalEmail,
      body,
      html: storedHtml,
      signature,
      authorKind: 'leader',
      authorId: leaderId,
      mirror,
    })
    if (!queued) return fail('Could not queue the reply. Try again.')
  } else {
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
        headers: { 'Message-ID': messageId },
      })
    } catch {
      return fail('Could not queue the reply. Try again.')
    }
    await appendConversationMessage({
      conversationId: conv.id,
      direction: 'outbound',
      authorKind: 'leader',
      authorId: leaderId,
      body,
      bodyHtml: storedHtml,
      externalMessageId: messageId,
      mirror,
    })
  }
  if (conv.status === 'open' || conv.status === 'in_progress') {
    await updateConversationFields(conv.id, { status: 'waiting' })
  }
  revalidatePath('/lead/inbox')
  return ok()
}

/** Triage a conversation the leader owns (status / priority / assignee + optional handoff note). */
export async function setLeaderTriage(input: {
  conversationId: string
  status?: string
  priority?: string
  assignedTo?: string | null
  handoffNote?: string | null
}): Promise<ActionResult> {
  const { profileId: leaderId } = await requireLeadFloor()
  const conv = await ownedConversation(leaderId, input.conversationId)
  if (!conv) return fail('That conversation is not one of yours.')

  const patch: { status?: string; priority?: string; assignedTo?: string | null } = {}
  if (input.status && input.status !== conv.status) patch.status = input.status
  if (input.priority) patch.priority = input.priority
  const assigneeChanged = input.assignedTo !== undefined && (input.assignedTo || null) !== conv.assignedTo
  if (assigneeChanged) patch.assignedTo = input.assignedTo || null
  if (Object.keys(patch).length === 0) return ok()

  const okUpdate = await updateConversationFields(conv.id, patch)
  if (!okUpdate) return fail('Could not update the conversation. Try again.')

  if (assigneeChanged) {
    await recordAssignment({ conversationId: conv.id, assignedTo: input.assignedTo || null, assignedBy: leaderId, reason: 'manual' })
    const note = (input.handoffNote ?? '').trim()
    if (note) {
      await appendConversationMessage({
        conversationId: conv.id,
        direction: 'internal',
        authorKind: 'leader',
        authorId: leaderId,
        body: note,
        isInternal: true,
      })
    }
  }
  revalidatePath('/lead/inbox')
  return ok()
}

// ── Vera seams (ADR-812 Phase 5), leader-scoped — thin wrappers over the ONE shared conversation-AI
// (lib/comms/vera-conversation), the same logic the platform + Space CRMs call. Gated by requireLeadFloor
// + the ownership check, so a leader can only ask Vera about a thread on their own sender trail.

/** Draft a reply with Vera for a conversation the leader owns (lands in the composer to review + send). */
export async function draftLeaderReply(conversationId: string): Promise<ActionResult<{ draft: string }>> {
  const { profileId: leaderId } = await requireLeadFloor()
  const conv = await ownedConversation(leaderId, conversationId)
  if (!conv) return fail('That conversation is not one of yours.')
  return veraDraftReply(conv.id, leaderId)
}

/** One short summary of a conversation the leader owns (a skim aid; never sent). */
export async function summarizeLeaderConversation(conversationId: string): Promise<ActionResult<{ summary: string }>> {
  const { profileId: leaderId } = await requireLeadFloor()
  const conv = await ownedConversation(leaderId, conversationId)
  if (!conv) return fail('That conversation is not one of yours.')
  return veraSummarize(conv.id, leaderId)
}

/** Suggest + apply a priority for a conversation the leader owns (persists reversibly). */
export async function suggestLeaderTriage(
  conversationId: string,
): Promise<ActionResult<{ priority: ConversationPriority; reason: string }>> {
  const { profileId: leaderId } = await requireLeadFloor()
  const conv = await ownedConversation(leaderId, conversationId)
  if (!conv) return fail('That conversation is not one of yours.')
  const result = await veraSuggestTriage(conv.id, leaderId)
  revalidatePath('/lead/inbox')
  return result
}

/** Broadcast a message to the leader's whole downline, as themselves. Fans out into one tracked
 *  conversation per member (each independently replyable back into this same inbox). */
export async function sendLeaderBroadcast(input: { subject: string; body: string }): Promise<ActionResult<{ sent: number; skipped: number; total: number }>> {
  const { profileId: leaderId } = await requireLeadFloor()
  const subject = (input.subject ?? '').trim()
  const body = (input.body ?? '').trim()
  if (!subject) return fail('Add a subject line.')
  if (!body) return fail('Write your message first.')

  const result = await sendLeaderMessageToDownline(leaderId, { subject, body })
  if (result.total === 0) return fail('You have no members to message yet.')
  revalidatePath('/lead/inbox')
  return ok(result)
}
