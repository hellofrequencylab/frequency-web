'use server'

// Public server actions for the anonymous live-chat widget (ADR-816). No auth — a visitor is identified by
// the capability token (verified inside the support-chat layer). Rate-limited per IP / token because these
// are unauthenticated + abuse-prone. Realtime fan-out is done on the CLIENT (Broadcast); these only persist.

import { headers } from 'next/headers'
import { rateLimitOk } from '@/lib/rate-limit'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  startSupportChat,
  postSupportChatMessage,
  loadSupportChatHistory,
  type ChatMessage,
} from '@/lib/comms/support-chat'

async function callerIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}

export async function startSupportChatAction(input: {
  name: string
  email: string
  message?: string
}): Promise<ActionResult<{ ref: string; token: string }>> {
  if (!(await rateLimitOk('support_chat_start', await callerIp(), 5, '1 m'))) {
    return fail('Too many attempts. Please wait a moment and try again.')
  }
  const started = await startSupportChat(input)
  if (!started) return fail('Live chat is unavailable right now. Please email us instead.')
  return ok(started)
}

export async function postSupportChatMessageAction(input: {
  ref: string
  token: string
  body: string
}): Promise<ActionResult<ChatMessage>> {
  // Rate-limit by the token (their own thread) so one chatty visitor can't be blocked by another on the same IP.
  if (!(await rateLimitOk('support_chat_post', (input.token || '').slice(0, 32) || (await callerIp()), 30, '1 m'))) {
    return fail('You are sending messages too fast. Give it a second.')
  }
  const msg = await postSupportChatMessage(input)
  if (!msg) return fail('Could not send that. Try again.')
  return ok(msg)
}

export async function loadSupportChatHistoryAction(input: {
  ref: string
  token: string
}): Promise<ActionResult<{ messages: ChatMessage[] }>> {
  const messages = await loadSupportChatHistory(input)
  return ok({ messages })
}
