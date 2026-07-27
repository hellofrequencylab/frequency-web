// LEADER → GROUP fan-out (ADR-812, Phase 4) — a community leader emails the members below them "as
// themselves," and every recipient becomes an individual TRACKED conversation on the leader's sender
// trail. Not one blast: N conversations, each independently replyable, each landing back in the leader's
// inbox (/lead/inbox). Reuses the audience machinery (resolveSegment over place selectors) and the
// conversation spine (openOrGetConversation + appendConversationMessage + the per-thread reply address).
//
// Server-only. The CALLER authorizes: the downline is resolved strictly from the leader's own led circles
// (getLedCircles is keyed to their stewardship), so a leader can only ever reach their own people.

import { createAdminClient } from '@/lib/supabase/admin'
import { getLedCircles } from '@/app/(main)/lead/load-led-circles'
import { resolveSegment, type Recipient } from '@/lib/studio/campaigns'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { enqueueEmail } from '@/lib/email'
import { buildConversationReplyAddress } from '@/lib/comms/reply-address'
import { openOrGetConversation, appendConversationMessage, newConversationMessageId } from '@/lib/comms/conversations'

/**
 * The leader's downline as send recipients: every active member of every circle the leader stewards
 * (hosts, guides, or mentors), de-duped, in the shared { contactId, email, profileId } send shape.
 * Reuses resolveSegment('circle:<id>') so it inherits the exact place-tree walk + not-unsubscribed rule
 * the CRM composer already uses. FAIL-SAFE: [] on any error (a leader with no circles reaches nobody).
 */
export async function segmentForLeaderDownline(leaderProfileId: string): Promise<Recipient[]> {
  const id = typeof leaderProfileId === 'string' ? leaderProfileId.trim() : ''
  if (!id) return []
  try {
    const circles = await getLedCircles(id)
    if (circles.length === 0) return []
    const byContact = new Map<string, Recipient>()
    // Resolve each led circle's audience through the shared segment path, then union by contact id so a
    // member in two of the leader's circles is emailed once.
    const lists = await Promise.all(circles.map((c) => resolveSegment(`circle:${c.id}`)))
    for (const list of lists) {
      for (const r of list) if (r.contactId && !byContact.has(r.contactId)) byContact.set(r.contactId, r)
    }
    return [...byContact.values()]
  } catch {
    return []
  }
}

/** The count a leader sees before sending ("this reaches N people"). FAIL-SAFE: 0. */
export async function leaderDownlineReach(leaderProfileId: string): Promise<number> {
  return (await segmentForLeaderDownline(leaderProfileId)).length
}

export interface LeaderSendResult {
  total: number
  sent: number
  skipped: number
}

/** The leader's conversational sending identity: "<Name> via Frequency <people@…>" (DKIM-aligned; never
 *  the leader's raw mailbox). Mirrors the workspace reply From. */
function leaderFrom(name: string | null): string {
  const addr = process.env.EMAIL_CONVERSATION_FROM ?? process.env.EMAIL_FROM ?? 'people@people.frequencylocal.com'
  const clean = (name ?? 'Frequency').replace(/["\\<>]/g, '').trim() || 'Frequency'
  return `${clean} via Frequency <${addr}>`
}

async function profileDisplayName(profileId: string): Promise<string | null> {
  try {
    const db = createAdminClient()
    const { data } = await db.from('profiles').select('display_name').eq('id', profileId).maybeSingle()
    return data?.display_name ?? null
  } catch {
    return null
  }
}

/** Plain-text body → minimal safe HTML (escaped, newlines to <br>). No external template. */
function bodyToHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // token-ok: inline style in a server-rendered HTML message body (no CSS vars available in email)
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">${escaped.replace(/\n/g, '<br>')}</div>`
}

/**
 * Send a message from a leader to their whole downline, AS THEMSELVES, fanning out into one tracked
 * conversation per recipient. Each recipient is consent-gated (member lifecycle mail); a blocked or
 * un-openable recipient is skipped, never failed. Every send: open/get the leader-owned conversation,
 * enqueue the email with the per-conversation Reply-To + Message-ID (no List-Unsubscribe: this is
 * relationship mail from their leader, replyable 1:1), and append the outbound message (mirrored to the
 * CRM timeline). Returns the tallies for the confirmation UI.
 *
 * AUTHORIZATION: resolve the audience ONLY via segmentForLeaderDownline(leaderProfileId) — it is keyed to
 * the leader's own stewardship, so this can never reach outside their group. The caller still gates entry
 * (requireLeadFloor).
 */
export async function sendLeaderMessageToDownline(
  leaderProfileId: string,
  input: { subject: string; body: string },
): Promise<LeaderSendResult> {
  const leaderId = typeof leaderProfileId === 'string' ? leaderProfileId.trim() : ''
  const subject = (input.subject ?? '').trim().slice(0, 200)
  const body = (input.body ?? '').trim()
  if (!leaderId || !subject || !body) return { total: 0, sent: 0, skipped: 0 }

  const recipients = await segmentForLeaderDownline(leaderId)
  if (recipients.length === 0) return { total: 0, sent: 0, skipped: 0 }

  const senderName = await profileDisplayName(leaderId)
  const from = leaderFrom(senderName)
  const html = bodyToHtml(body)

  let sent = 0
  let skipped = 0
  for (const r of recipients) {
    // Consent gate: a leader-to-member note is opt-out member mail → the lifecycle category.
    if (r.profileId) {
      const gate = await resolveSendGate(r.profileId, 'email', 'lifecycle', { email: r.email })
      if (!gate.allowed) {
        skipped++
        continue
      }
    }

    const conv = await openOrGetConversation({
      kind: 'leader',
      externalEmail: r.email,
      ownerProfileId: leaderId,
      subject,
      contactId: r.contactId,
      memberProfileId: r.profileId ?? null,
      metadata: { source: 'leader_broadcast' },
    })
    if (!conv) {
      skipped++
      continue
    }

    const messageId = newConversationMessageId(conv.ref)
    try {
      await enqueueEmail({
        to: r.email,
        from,
        replyTo: buildConversationReplyAddress(conv.ref),
        subject,
        html,
        text: body,
        headers: { 'Message-ID': messageId },
      })
    } catch {
      skipped++
      continue
    }

    await appendConversationMessage({
      conversationId: conv.id,
      direction: 'outbound',
      authorKind: 'leader',
      authorId: leaderId,
      body,
      bodyHtml: html,
      externalMessageId: messageId,
      mirror: {
        ownerProfileId: leaderId,
        subjectKind: r.profileId ? 'profile' : 'contact',
        subjectId: (r.profileId ?? r.contactId)!,
        subject,
      },
    })
    sent++
  }

  return { total: recipients.length, sent, skipped }
}
