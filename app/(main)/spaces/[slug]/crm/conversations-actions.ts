'use server'

// Space-scoped Conversation Workspace actions (ADR-812) — the per-tenant sibling of the platform
// app/(main)/admin/crm/conversations/actions.ts. A space MANAGER (not platform staff) works the ticketed
// threads that belong to THEIR space: reply as the space, add an internal note, and triage
// (status / priority / assign / trade). Every action re-runs the space-manage gate AND a hard tenancy
// check (the conversation's space_id must equal this space), so a manager can never touch another space's
// thread. Reply routing (conversational From + per-conversation Reply-To + Message-ID + append) mirrors the
// platform action exactly; only the GATE (space-manage instead of requireAdmin) and the tenancy check differ.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { escapeLike } from '@/lib/search-sanitize'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { enqueueEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { buildConversationReplyAddress } from '@/lib/comms/reply-address'
import {
  getConversationById,
  openOrGetConversation,
  appendConversationMessage,
  updateConversationFields,
  recordAssignment,
  newConversationMessageId,
  type ConversationRow,
  type AppendMessageInput,
} from '@/lib/comms/conversations'
import { conversationBatchWindowMinutes, queueOutboundMessage } from '@/lib/comms/outbound-batch'
import { listSpaceAssignableAgents } from '@/lib/comms/workspace'
import { CONVERSATION_STATUSES, CONVERSATION_PRIORITIES } from '@/lib/comms/labels'

interface SpaceGate {
  spaceId: string
  slug: string
  brandName: string
  ownerProfileId: string | null
  viewerProfileId: string
}

/** Re-run the space-manage gate. Returns the resolved space context or an error message. */
async function gateSpace(slug: string): Promise<{ gate: SpaceGate } | { error: string }> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  if (!viewerProfileId) return { error: 'Sign in to continue.' }
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return { error: 'We could not find that space.' }
  const { canManage } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage) return { error: 'You do not manage this space.' }
  return {
    gate: {
      spaceId: space.id,
      slug,
      brandName: space.brandName ?? space.name,
      ownerProfileId: space.ownerProfileId ?? null,
      viewerProfileId,
    },
  }
}

/** gateSpace + load the conversation + tenancy-check it belongs to this space. */
async function gateConversation(
  slug: string,
  conversationId: string,
): Promise<{ gate: SpaceGate; conv: ConversationRow } | { error: string }> {
  const gated = await gateSpace(slug)
  if ('error' in gated) return gated
  const conv = await getConversationById((conversationId ?? '').trim())
  if (!conv) return { error: 'That conversation no longer exists.' }
  // TENANCY: fail-closed unless the thread is this space's own.
  if (conv.spaceId !== gated.gate.spaceId) return { error: 'That conversation is not in this space.' }
  return { gate: gated.gate, conv }
}

/** The Space's conversational sending identity: the brand name on the verified conversational address. */
function spaceConversationFrom(brandName: string): string {
  const addr = process.env.EMAIL_CONVERSATION_FROM ?? process.env.EMAIL_FROM ?? 'people@people.frequencylocal.com'
  const clean = (brandName || 'Frequency').replace(/["\\<>]/g, '').trim() || 'Frequency'
  return `${clean} <${addr}>`
}

/** Reply to (or add an internal note on) a conversation this space owns. */
export async function sendSpaceConversationReplyAction(
  slug: string,
  input: { conversationId: string; body: string; isInternal?: boolean },
): Promise<ActionResult> {
  const gated = await gateConversation(slug, input.conversationId)
  if ('error' in gated) return fail(gated.error)
  const { gate, conv } = gated

  const body = (input.body ?? '').trim()
  if (!body) return fail(input.isInternal ? 'Write a note first.' : 'Write a reply first.')

  if (input.isInternal) {
    const noted = await appendConversationMessage({
      conversationId: conv.id,
      direction: 'internal',
      authorKind: 'staff',
      authorId: gate.viewerProfileId,
      body,
      isInternal: true,
    })
    if (!noted) return fail('Could not save the note. Try again.')
    revalidatePath(`/spaces/${slug}/crm/conversations`)
    return ok()
  }

  if (!conv.externalEmail) return fail('We have no email address for this conversation.')
  if (conv.memberProfileId) {
    const gateResult = await resolveSendGate(conv.memberProfileId, 'email', 'marketing', { email: conv.externalEmail })
    if (!gateResult.allowed) return fail('This member has email turned off, so this reply cannot go out.')
  }

  const from = spaceConversationFrom(gate.brandName)
  const subject = replySubject(conv.subject)
  const html = bodyToHtml(body)
  const mirror: AppendMessageInput['mirror'] =
    conv.memberProfileId || conv.contactId
      ? {
          ownerProfileId: gate.ownerProfileId ?? gate.viewerProfileId,
          subjectKind: conv.memberProfileId ? 'profile' : 'contact',
          subjectId: (conv.memberProfileId ?? conv.contactId)!,
          spaceId: gate.spaceId,
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
      html,
      authorKind: 'staff',
      authorId: gate.viewerProfileId,
      mirror,
    })
    if (!queued) return fail('Could not queue the reply. Try again.')
  } else {
    const messageId = newConversationMessageId(conv.ref)
    try {
      await enqueueEmail({
        to: conv.externalEmail,
        from,
        replyTo: buildConversationReplyAddress(conv.ref),
        subject,
        html,
        text: body,
        headers: { 'Message-ID': messageId },
      })
    } catch {
      return fail('Could not queue the reply. Try again.')
    }
    await appendConversationMessage({
      conversationId: conv.id,
      direction: 'outbound',
      authorKind: 'staff',
      authorId: gate.viewerProfileId,
      body,
      bodyHtml: html,
      externalMessageId: messageId,
      mirror,
    })
  }

  if (conv.status === 'open' || conv.status === 'in_progress') {
    await updateConversationFields(conv.id, { status: 'waiting' })
  }
  revalidatePath(`/spaces/${slug}/crm/conversations`)
  return ok()
}

/** Triage a conversation this space owns: status / priority / assignee (+ optional handoff note). The
 *  assignee must be one of THIS space's own team (tenancy on the trade). */
export async function setSpaceConversationTriageAction(
  slug: string,
  input: {
    conversationId: string
    status?: string
    priority?: string
    assignedTo?: string | null
    handoffNote?: string | null
  },
): Promise<ActionResult> {
  const gated = await gateConversation(slug, input.conversationId)
  if ('error' in gated) return fail(gated.error)
  const { gate, conv } = gated

  // Validate status/priority against the known enums so a crafted request can't reach the DB check.
  if (input.status && !CONVERSATION_STATUSES.includes(input.status as (typeof CONVERSATION_STATUSES)[number])) {
    return fail('Unknown status.')
  }
  if (input.priority && !CONVERSATION_PRIORITIES.includes(input.priority as (typeof CONVERSATION_PRIORITIES)[number])) {
    return fail('Unknown priority.')
  }

  const patch: { status?: string; priority?: string; assignedTo?: string | null } = {}
  if (input.status && input.status !== conv.status) patch.status = input.status
  if (input.priority) patch.priority = input.priority
  const assigneeChanged = input.assignedTo !== undefined && (input.assignedTo || null) !== conv.assignedTo
  if (assigneeChanged) {
    // TENANCY on the trade: only this space's own team may receive the assignment.
    if (input.assignedTo) {
      const agents = await listSpaceAssignableAgents(gate.spaceId, gate.ownerProfileId)
      if (!agents.some((a) => a.id === input.assignedTo)) return fail('You can only assign to your own team.')
    }
    patch.assignedTo = input.assignedTo || null
  }
  if (Object.keys(patch).length === 0) return ok()

  const okUpdate = await updateConversationFields(conv.id, patch)
  if (!okUpdate) return fail('Could not update the conversation. Try again.')

  if (assigneeChanged) {
    await recordAssignment({ conversationId: conv.id, assignedTo: input.assignedTo || null, assignedBy: gate.viewerProfileId, reason: 'manual' })
    const note = (input.handoffNote ?? '').trim()
    if (note) {
      await appendConversationMessage({
        conversationId: conv.id,
        direction: 'internal',
        authorKind: 'staff',
        authorId: gate.viewerProfileId,
        body: note,
        isInternal: true,
      })
    }
  }
  revalidatePath(`/spaces/${slug}/crm/conversations`)
  return ok()
}

/** Resolve one of THIS space's own contacts by email (space_id-pinned). Returns the contact + linked
 *  member profile, or null when the address is not a contact of this space. */
async function resolveSpaceCounterpart(
  spaceId: string,
  email: string,
): Promise<{ contactId: string; profileId: string | null } | null> {
  const needle = email.trim().toLowerCase()
  if (!needle) return null
  try {
    const db = createAdminClient() as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data } = await db
      .from('contacts')
      .select('id, profile_id')
      .eq('space_id', spaceId)
      // escapeLike: `_`/`%` in an email are ILIKE wildcards — an address like `a_b@x.com` must not bind
      // to `axb@x.com` (wrong contact → wrong thread).
      .ilike('email', escapeLike(needle))
      .limit(1)
      .maybeSingle()
    if (!data) return null
    return { contactId: String(data.id), profileId: (data.profile_id as string) ?? null }
  } catch {
    return null
  }
}

/** Start a NEW ticketed conversation with one of this space's members/contacts, and send the first
 *  message as the space. Seeds the space's Conversations console (the reply-able 1:1 path). */
export async function startSpaceConversationAction(
  slug: string,
  input: { email: string; subject: string; body: string },
): Promise<ActionResult<{ ref: string }>> {
  const gated = await gateSpace(slug)
  if ('error' in gated) return fail(gated.error)
  const { gate } = gated

  const email = (input.email ?? '').trim().toLowerCase()
  const subject = (input.subject ?? '').trim().slice(0, 200)
  const body = (input.body ?? '').trim()
  if (!email || !email.includes('@')) return fail('Add a valid recipient email.')
  if (!subject) return fail('Add a subject line.')
  if (!body) return fail('Write your message first.')

  const counterpart = await resolveSpaceCounterpart(gate.spaceId, email)
  if (!counterpart) return fail("That email isn't a contact in this space yet. Add them to your contacts first.")

  // Consent: honor a member's email preferences; a pure contact/lead in a 1:1 the space is starting is the
  // consent context itself (mirrors the platform Message-Member path).
  if (counterpart.profileId) {
    const gateResult = await resolveSendGate(counterpart.profileId, 'email', 'marketing', { email })
    if (!gateResult.allowed) return fail('This member has email turned off, so this message cannot go out.')
  }

  const conv = await openOrGetConversation({
    kind: 'crm',
    externalEmail: email,
    ownerProfileId: gate.ownerProfileId ?? gate.viewerProfileId,
    subject,
    contactId: counterpart.contactId,
    memberProfileId: counterpart.profileId,
    spaceId: gate.spaceId,
    metadata: { source: 'space_console' },
  })
  if (!conv) return fail('Could not open the conversation. Try again.')

  const messageId = newConversationMessageId(conv.ref)
  const html = bodyToHtml(body)
  try {
    await enqueueEmail({
      to: email,
      from: spaceConversationFrom(gate.brandName),
      replyTo: buildConversationReplyAddress(conv.ref),
      subject,
      html,
      text: body,
      headers: { 'Message-ID': messageId },
    })
  } catch {
    return fail('Could not queue the message. Try again.')
  }

  await appendConversationMessage({
    conversationId: conv.id,
    direction: 'outbound',
    authorKind: 'staff',
    authorId: gate.viewerProfileId,
    body,
    bodyHtml: html,
    externalMessageId: messageId,
    mirror: {
      ownerProfileId: gate.ownerProfileId ?? gate.viewerProfileId,
      subjectKind: counterpart.profileId ? 'profile' : 'contact',
      subjectId: counterpart.profileId ?? counterpart.contactId,
      spaceId: gate.spaceId,
      subject,
    },
  })

  revalidatePath(`/spaces/${slug}/crm/conversations`)
  return ok({ ref: conv.ref })
}

/** `Re:`-prefix the subject once. */
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
