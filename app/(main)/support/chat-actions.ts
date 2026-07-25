'use server'

// Member-facing support CONVERSATION actions (chat consolidation). A signed-in member can send a
// support request that becomes a ticketed conversation on the comms spine, bound to their profile, and
// then SEE + reply to it in their own inbox (the dock's Help & support section). The operator receives
// and answers it in the CRM Conversations workspace exactly like any other channel; the reply threads
// straight back here. Distinct from the older support_tickets/ReportDialog path (System A) — this is the
// unified spine (System B) the site is consolidating onto.

import { requireProfileId, getCallerProfile } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { startSupportChat, type ChatMessage } from '@/lib/comms/support-chat'
import {
  listMySupportThreads,
  getMySupportThread,
  postMySupportMessage,
  type MemberSupportThread,
  type MemberSupportDetail,
} from '@/lib/comms/member-support'

/** Send a new support request as the signed-in member. Creates (or reuses the open) member-bound spine
 *  conversation and returns its ref so the UI can open the thread. */
export async function startMySupportRequestAction(input: {
  message: string
}): Promise<ActionResult<{ ref: string }>> {
  const me = await getCallerProfile()
  if (!me) return fail('Sign in to send a support request.')
  const message = (input.message ?? '').trim()
  if (!message) return fail('Write your message first.')
  // name/email are resolved from the member's own profile inside startSupportChat (memberProfileId set).
  const started = await startSupportChat({ name: '', email: '', message, memberProfileId: me.id })
  if (!started) return fail('Support is unavailable right now. Please email us instead.')
  return ok({ ref: started.ref })
}

/** The member's own support threads (newest first), for the inbox list. */
export async function listMySupportRequestsAction(): Promise<ActionResult<{ threads: MemberSupportThread[] }>> {
  await requireProfileId()
  return ok({ threads: await listMySupportThreads() })
}

/** One of the member's own support threads, with its messages. */
export async function loadMySupportThreadAction(ref: string): Promise<ActionResult<MemberSupportDetail>> {
  await requireProfileId()
  const detail = await getMySupportThread(ref)
  if (!detail) return fail('We could not find that conversation.')
  return ok(detail)
}

/** Post a reply to one of the member's own support threads. Ownership re-checked in the helper. */
export async function postMySupportReplyAction(input: {
  ref: string
  body: string
}): Promise<ActionResult<ChatMessage>> {
  await requireProfileId()
  const msg = await postMySupportMessage(input.ref, input.body)
  if (!msg) return fail('Could not send that. Try again.')
  return ok(msg)
}
