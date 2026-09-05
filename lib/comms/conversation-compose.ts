// CONVERSATION COMPOSE — the ONE shared primitive for starting a NEW ticketed conversation with a
// first outbound message (new-outreach compose, ADR-821). The platform Conversations workspace and
// the per-Space console both delegate here, so a fresh 1:1 outreach gets exactly the reply pipeline
// a reply gets: the per-conversation Reply-To (the reply comes back as the same ticket), a stamped
// Message-ID, the shared renderReplyEmail template + signature (or a studio-compiled HTML body when
// the caller composed one in the site-wide email editor), and the batch window (a burst of sends
// coalesces exactly like replies do). Server-only; NOT 'use server' (mirrors lib/comms/leader-send).
//
// AUTHZ + CONSENT LIVE AT THE CALL SITE: the platform action gates requireAdmin + the lifecycle send
// gate; the space action gates space-manage + the tenant consent lane. This primitive trusts its
// caller exactly like appendConversationMessage does.
// authz-delegated: caller-gated compose primitive (ADR-274) — both call sites (the platform and
// space conversations actions) authenticate the operator and run the consent gates before calling;
// every write is bound to the conversation the caller opened.

import { enqueueEmail } from '@/lib/email'
import {
  openOrGetConversation,
  appendConversationMessage,
  newConversationMessageId,
  type AppendMessageInput,
} from '@/lib/comms/conversations'
import type { InteractionScopeRef } from '@/lib/crm/interactions'
import { buildConversationReplyAddress, conversationSigningAvailable } from '@/lib/comms/reply-address'
import { renderReplyEmail } from '@/lib/comms/email-template'
import { conversationBatchWindowMinutes, queueOutboundMessage } from '@/lib/comms/outbound-batch'
import { conversationFrom } from '@/lib/comms/from-address'

// SINGLE-SOURCE sentinel (check:crm-parity): the compose block below — open conversation + reply
// address + first outbound — must never be re-inlined into a surface.
// sentinel:conversation-compose-pipeline

/** The Space's conversational sending identity: the brand name on the verified conversational
 *  address. Shared by every space-side compose surface (the console dialog + the member composer). */
// 2026-09-05 (scan2 L3-01): the brand form of the shared From helper (no "via Frequency" suffix, the
// address extracted from EMAIL_FROM rather than nested inside it, blank env treated as unset).
export function spaceConversationFrom(brandName: string): string {
  return conversationFrom(brandName, { via: false })
}

export interface StartConversationMessageInput {
  /** The CRM timeline owner (the operator/leader whose book this thread belongs to). */
  ownerProfileId: string
  /** The signed-in actor sending the first message. */
  actorProfileId: string
  /** How the first message is authored on the thread. */
  actorAuthorKind: 'staff' | 'leader'
  /** The full From line (person or brand — the caller resolves identity). */
  from: string
  /** The sender's signature (renderReplyEmail appends it; batching stamps it at flush). */
  signature: string | null
  /** The recipient. */
  email: string
  contactId: string | null
  profileId: string | null
  /** The lane: a Space id, or null for the platform lane. */
  spaceId?: string | null
  subject: string
  /** Plain-text body — ALWAYS required (the thread record + batch coalescing read it). */
  body: string
  /** Optional studio-compiled HTML (the site-wide email editor). When absent, renderReplyEmail
   *  wraps the plain body. Pass the compiled document WITHOUT double-wrapping chrome. */
  bodyHtml?: string | null
  metadata?: Record<string, unknown>
  /** The lane this compose belongs to (ADR-827 scope spine). Rides the conversation's thread key
   *  (a scoped compose opens/reuses a thread IN that scope) and stamps the timeline mirror. Callers
   *  with a scope keep the legacy metadata convention too (dual-write). */
  scope?: InteractionScopeRef | null
}

export interface StartConversationMessageResult {
  ref: string
  conversationId: string
}

/** Open (or reuse) the ticketed conversation and send its first outbound message through the shared
 *  pipeline. Returns null on any failure (the caller surfaces the error copy). */
export async function startConversationMessage(
  input: StartConversationMessageInput,
): Promise<StartConversationMessageResult | null> {
  const email = (input.email ?? '').trim().toLowerCase()
  const subject = (input.subject ?? '').trim().slice(0, 200)
  const body = (input.body ?? '').trim()
  if (!email || !email.includes('@') || !subject || !body) return null
  if (!input.contactId && !input.profileId) return null // the conversation CHECK needs a counterparty
  // 2026-09-05 (scan2 L3-06): the per-thread Reply-To needs a signing secret; in production without one
  // buildConversationReplyAddress THROWS. Check first, so a misconfigured server opens no thread and
  // records no message it can never send (the predicate logs the refusal).
  if (!conversationSigningAvailable()) return null

  const conv = await openOrGetConversation({
    kind: 'crm',
    externalEmail: email,
    ownerProfileId: input.ownerProfileId,
    subject,
    contactId: input.contactId,
    memberProfileId: input.profileId,
    spaceId: input.spaceId ?? null,
    scopeKind: input.scope?.kind ?? null,
    scopeId: input.scope?.id ?? null,
    metadata: input.metadata ?? { source: 'compose' },
  })
  if (!conv) return null

  const mirror: AppendMessageInput['mirror'] = {
    ownerProfileId: input.ownerProfileId,
    subjectKind: input.profileId ? 'profile' : 'contact',
    subjectId: (input.profileId ?? input.contactId)!,
    spaceId: input.spaceId ?? null,
    subject,
    scope: input.scope ?? null,
  }

  // The shared render: the studio-compiled document when the caller composed one, else the plain
  // branded reply template. Batching stores the CLEAN body and stamps chrome at flush.
  const rendered = input.bodyHtml
    ? { html: input.bodyHtml, text: body }
    : renderReplyEmail(body, input.signature)

  if (conversationBatchWindowMinutes() > 0) {
    const queued = await queueOutboundMessage({
      conversationId: conv.id,
      from: input.from,
      to: email,
      body,
      html: input.bodyHtml ?? rendered.html,
      signature: input.signature,
      authorKind: input.actorAuthorKind,
      authorId: input.actorProfileId,
      mirror,
    })
    if (!queued) return null
    return { ref: conv.ref, conversationId: conv.id }
  }

  const messageId = newConversationMessageId(conv.ref)
  try {
    await enqueueEmail({
      to: email,
      from: input.from,
      replyTo: buildConversationReplyAddress(conv.ref),
      subject,
      html: rendered.html,
      text: rendered.text,
      headers: { 'Message-ID': messageId },
      // No List-Unsubscribe: a 1:1 human message is not bulk mail (CRM audit F6).
    })
  } catch {
    return null
  }

  await appendConversationMessage({
    conversationId: conv.id,
    direction: 'outbound',
    authorKind: input.actorAuthorKind,
    authorId: input.actorProfileId,
    body,
    bodyHtml: rendered.html,
    externalMessageId: messageId,
    mirror,
  })

  return { ref: conv.ref, conversationId: conv.id }
}
