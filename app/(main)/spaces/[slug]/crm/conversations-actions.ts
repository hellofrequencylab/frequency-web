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
import { canEmailContact } from '@/lib/crm/contact-consent'
import { isContactTopicMuted } from '@/lib/comms/contact-preferences'
import { buildConversationReplyAddress } from '@/lib/comms/reply-address'
import {
  getConversationById,
  appendConversationMessage,
  updateConversationFields,
  recordAssignment,
  newConversationMessageId,
  conversationScopeRef,
  type ConversationRow,
  type AppendMessageInput,
} from '@/lib/comms/conversations'
import { conversationBatchWindowMinutes, queueOutboundMessage } from '@/lib/comms/outbound-batch'
import { brandSignature } from '@/lib/comms/signature'
import { startConversationMessage, spaceConversationFrom } from '@/lib/comms/conversation-compose'
import { renderReplyEmail } from '@/lib/comms/email-template'
import { listSpaceAssignableAgents } from '@/lib/comms/workspace'
import { CONVERSATION_STATUSES, CONVERSATION_PRIORITIES, type ConversationPriority } from '@/lib/comms/labels'
import { veraDraftReply, veraSummarize, veraSuggestTriage } from '@/lib/comms/vera-conversation'

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

// spaceConversationFrom moved to the shared compose module (ADR-822): one From identity for every
// space-side compose surface.

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
    // A 1:1 reply in an active conversation is transactional — send unless the address is hard-suppressed.
    const gateResult = await resolveSendGate(conv.memberProfileId, 'email', 'transactional', { email: conv.externalEmail })
    if (!gateResult.allowed) return fail('This address has bounced or marked us as spam, so this reply cannot go out.')
  }

  const from = spaceConversationFrom(gate.brandName)
  // The Space reply's From is the BRAND, so the signature must be the brand's, not the acting manager's
  // personal saved signature (which resolveSignature would return). Use the brand-scoped helper.
  const signature = brandSignature(gate.brandName)
  const subject = replySubject(conv.subject)
  const storedHtml = bodyToHtml(body) // clean body for the thread + CRM mirror
  const mirror: AppendMessageInput['mirror'] =
    conv.memberProfileId || conv.contactId
      ? {
          ownerProfileId: gate.ownerProfileId ?? gate.viewerProfileId,
          subjectKind: conv.memberProfileId ? 'profile' : 'contact',
          subjectId: (conv.memberProfileId ?? conv.contactId)!,
          spaceId: gate.spaceId,
          subject,
          // A reply inherits the thread's lane (ADR-827 scope spine).
          scope: conversationScopeRef(conv),
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
      authorKind: 'staff',
      authorId: gate.viewerProfileId,
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
      authorKind: 'staff',
      authorId: gate.viewerProfileId,
      body,
      bodyHtml: storedHtml,
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

// ── Vera seams (ADR-812 Phase 5), space-scoped — thin wrappers over the ONE shared conversation-AI
// (lib/comms/vera-conversation), the exact same logic the platform CRM calls. Each gates through
// gateConversation (space-manage + hard tenancy on the thread's space_id) BEFORE handing the shared logic
// the tenancy-checked conv.id, so a manager can only ask Vera about their own space's threads. An edit to
// the shared module changes both surfaces at once.

/** Draft a reply with Vera for a conversation this space owns (lands in the composer for a human to send). */
export async function draftSpaceConversationReplyAction(
  slug: string,
  conversationId: string,
): Promise<ActionResult<{ draft: string }>> {
  const gated = await gateConversation(slug, conversationId)
  if ('error' in gated) return fail(gated.error)
  return veraDraftReply(gated.conv.id, gated.gate.viewerProfileId)
}

/** One short summary of a conversation this space owns (a skim aid; never sent). */
export async function summarizeSpaceConversationAction(
  slug: string,
  conversationId: string,
): Promise<ActionResult<{ summary: string }>> {
  const gated = await gateConversation(slug, conversationId)
  if ('error' in gated) return fail(gated.error)
  return veraSummarize(gated.conv.id, gated.gate.viewerProfileId)
}

/** Suggest + apply a priority for a conversation this space owns (persists reversibly). */
export async function suggestSpaceConversationTriageAction(
  slug: string,
  conversationId: string,
): Promise<ActionResult<{ priority: ConversationPriority; reason: string }>> {
  const gated = await gateConversation(slug, conversationId)
  if ('error' in gated) return fail(gated.error)
  const result = await veraSuggestTriage(gated.conv.id, gated.gate.viewerProfileId)
  revalidatePath(`/spaces/${slug}/crm/conversations`)
  return result
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

  // Consent (CRM audit F6, both halves): a Space starting outreach honors THIS SPACE's own consent
  // lane — the tenant contact's consent_state, the per-space suppression, and the per-space topic
  // mute — exactly like the Space campaign path (lib/spaces/email.ts). Two vocabularies compose
  // here: the CONTACT lane check runs as 'transactional' (allowed unless unsubscribed/suppressed —
  // 'marketing' would demand an explicit opt-in and silently block legitimate operator outreach to a
  // known contact), while a MEMBER's platform preference gates as 'lifecycle' (relationship mail, the
  // same classification leader-send uses — never 'transactional', which is reserved for replies
  // inside an active thread). The per-space 'marketing' topic mute still applies. FAIL-CLOSED.
  const spaceConsent = await canEmailContact(email, 'transactional', gate.spaceId)
  if (!spaceConsent.allowed) return fail('This contact has unsubscribed from this space, so this message cannot go out.')
  if (await isContactTopicMuted({ email, spaceId: gate.spaceId, topic: 'marketing' })) {
    return fail('This contact muted this kind of message, so it cannot go out.')
  }
  // A member who has turned email off entirely (their platform-level preference) is also honored.
  if (counterpart.profileId) {
    const gateResult = await resolveSendGate(counterpart.profileId, 'email', 'lifecycle', { email })
    if (!gateResult.allowed) return fail('This member has email turned off, so this message cannot go out.')
  }

  // The shared compose primitive (ADR-821): open the ticket + send the first message through the ONE
  // pipeline replies use — reply-token, Message-ID, renderReplyEmail + brand signature, batching.
  const started = await startConversationMessage({
    ownerProfileId: gate.ownerProfileId ?? gate.viewerProfileId,
    actorProfileId: gate.viewerProfileId,
    actorAuthorKind: 'staff',
    from: spaceConversationFrom(gate.brandName),
    signature: brandSignature(gate.brandName),
    email,
    contactId: counterpart.contactId,
    profileId: counterpart.profileId,
    spaceId: gate.spaceId,
    subject,
    body,
    metadata: { source: 'space_console' },
  })
  if (!started) return fail('Could not send that. Try again.')

  revalidatePath(`/spaces/${slug}/crm/conversations`)
  return ok({ ref: started.ref })
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
