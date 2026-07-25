'use server'

// Operator side of the live-chat bridge (ADR-816). The visitor's widget and the operator's thread join the
// same token-named Broadcast channel, so a reply shows up live on both. These actions PERSIST the operator's
// side (outbound `in_app` message on the comms spine) and serve the transcript; the client broadcasts the
// stored row. Admin-gated (same gate as the rest of the Conversations workspace).

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { getConversationByRef, appendConversationMessage } from '@/lib/comms/conversations'
import { makeChatToken } from '@/lib/comms/chat-token'
import { loadSupportChatHistory, type ChatMessage } from '@/lib/comms/support-chat'

const GATE = { min: 'janitor', staff: 'marketing' } as const

/** Send an operator reply into a live chat: persist an outbound `in_app` message and hand it back so the
 *  client can broadcast it to the visitor. */
export async function sendOperatorChatReplyAction(input: { ref: string; body: string }): Promise<ActionResult<ChatMessage>> {
  const { profileId } = await requireAdmin(GATE.min, { staff: GATE.staff })
  const conv = await getConversationByRef(input.ref)
  if (!conv) return fail('That conversation no longer exists.')
  const body = (input.body ?? '').trim().slice(0, 4000)
  if (!body) return fail('Write a reply first.')

  const out = await appendConversationMessage({
    conversationId: conv.id,
    direction: 'outbound',
    authorKind: 'staff',
    authorId: profileId,
    body,
    channel: 'in_app',
    mirror:
      conv.ownerProfileId && (conv.memberProfileId || conv.contactId)
        ? {
            ownerProfileId: conv.ownerProfileId,
            subjectKind: conv.memberProfileId ? 'profile' : 'contact',
            subjectId: (conv.memberProfileId ?? conv.contactId)!,
            spaceId: conv.spaceId,
            subject: conv.subject,
          }
        : null,
  })
  if (!out || !('id' in out)) return fail('Could not send. Try again.')
  revalidatePath('/admin/crm/conversations')
  return ok({ id: out.id, author: 'staff', body, at: new Date().toISOString() })
}

/** The transcript for the operator's live panel. Admin-gated; derives the capability token server-side. */
export async function loadOperatorChatHistoryAction(input: { ref: string }): Promise<ActionResult<{ messages: ChatMessage[] }>> {
  await requireAdmin(GATE.min, { staff: GATE.staff })
  const messages = await loadSupportChatHistory({ ref: input.ref, token: makeChatToken(input.ref) })
  return ok({ messages })
}
