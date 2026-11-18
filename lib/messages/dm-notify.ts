import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { routeNotification } from '@/lib/notifications/router'
import { buildDirectMessageEmail } from '@/lib/email'
import { log } from '@/lib/log'

// ── Tell the recipient a direct message arrived (EMAIL-055) ──────────────────────────────────────
// Until 2026-11-18 every path that wrote a 1:1 message (the DM composer, contact a seller, a service
// enquiry, message the host) inserted the row and stopped: no bell, no push, no email. The only signal
// was the unread badge, so a seller with an offer heard nothing until they opened the app.
//
// One notice per BURST, not per line: the recipient hears about a message only when they had already
// read past the sender's previous one. A back-and-forth while both are in the thread stays quiet.
// Routed as 'message.direct' on the `mentions` category, so the member's own Mentions switches decide
// each channel (in-app and email on by default, push opt-in). Best-effort: the message is already
// saved, so a notice failure is logged and never thrown at the sender.

const PREVIEW_CHARS = 140

/** True when this message starts a new unread burst for the recipient. Pure. */
export function startsUnreadBurst(lastReadAt: string | null, previousFromSenderAt: string | null): boolean {
  if (!previousFromSenderAt) return true
  if (!lastReadAt) return false
  return Date.parse(lastReadAt) >= Date.parse(previousFromSenderAt)
}

function preview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS - 1).trimEnd()}…` : flat
}

export async function notifyDirectMessage(
  admin: SupabaseClient,
  input: { conversationId: string; senderId: string; recipientId: string; messageId?: string | null; body: string },
): Promise<void> {
  const { conversationId, senderId, recipientId, body } = input
  try {
    const [{ data: participant }, { data: previous }] = await Promise.all([
      admin.from('conversation_participants').select('last_read_at')
        .eq('conversation_id', conversationId).eq('profile_id', recipientId).maybeSingle(),
      admin.from('messages').select('id, created_at')
        .eq('conversation_id', conversationId).eq('sender_id', senderId)
        .order('created_at', { ascending: false }).limit(2),
    ])
    const prior = ((previous ?? []) as { id: string; created_at: string }[]).find((m) => m.id !== input.messageId) ?? null
    const lastReadAt = (participant as { last_read_at: string | null } | null)?.last_read_at ?? null
    if (!startsUnreadBurst(lastReadAt, prior?.created_at ?? null)) return

    const { data: people } = await admin.from('profiles').select('id, display_name, auth_user_id, is_demo')
      .in('id', [senderId, recipientId])
    const rows = (people ?? []) as { id: string; display_name: string | null; auth_user_id: string | null; is_demo: boolean | null }[]
    const sender = rows.find((r) => r.id === senderId)
    const recipient = rows.find((r) => r.id === recipientId)
    if (!recipient || recipient.is_demo) return
    const senderName = sender?.display_name?.trim() || 'A member'
    const recipientName = recipient.display_name?.trim() || 'there'

    let email: string | null = null
    if (recipient.auth_user_id) {
      const { data } = await admin.auth.admin.getUserById(recipient.auth_user_id)
      email = data?.user?.email ?? null
    }

    const url = `/messages/${conversationId}`
    const text = preview(body)
    await routeNotification(
      'message.direct',
      { profileId: recipientId, email },
      {
        senderId,
        conversationId,
        title: senderName,
        body: text,
        url,
        tag: `dm:${conversationId}`,
        ...(email
          ? { email: buildDirectMessageEmail({ to: email, recipientName, recipientProfileId: recipientId, senderName, preview: text, threadPath: url }) }
          : {}),
      },
    )
  } catch (err) {
    log.warn('[messages] direct message notice failed', { conversationId, error: err instanceof Error ? err.message : String(err) })
  }
}
