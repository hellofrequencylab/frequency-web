import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EmailPayload } from '@/lib/email'
import { envString } from '@/lib/env/string'

/** Explicit consumer-before-producer switch; leave unset until SQL consequence, dispatch/acceptance and bridge-authentication gates pass. */
export function atomicBridgeEnabled(): boolean {
  return process.env.EMAIL_ATOMIC_BRIDGE_ENABLED === 'true'
}

/** Stable payload across webhook replay; random Message-ID would make an identical receive conflict. */
export function atomicBridgeMessageId(conversationId: string, externalMessageId: string): string {
  const host = envString('EMAIL_MESSAGE_ID_HOST', 'send.frequencylocal.com')
  return `<bridge.${createHash('sha256').update(JSON.stringify([conversationId, externalMessageId])).digest('hex')}@${host}>`
}

interface AtomicIntentResult { intentId: string; messageId: string; jobId: string | null; duplicate: boolean }
interface AtomicIntentRpc {
  rpc(name: 'enqueue_conversation_email_intent', args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }>
}

/** Service-only RPC independently binds fresh conversation, recipient, actor, tenant and observed sender. */
export async function enqueueAtomicConversationEmail(input: {
  conversationId: string; actorProfileId: string; externalMessageId: string; observedSender: string;
  body: string; payload: EmailPayload;
}): Promise<AtomicIntentResult> {
  if (!input.externalMessageId.trim()) throw new Error('Atomic bridge requires a receipt Message-ID')
  const db = createAdminClient() as unknown as AtomicIntentRpc
  const { data, error } = await db.rpc('enqueue_conversation_email_intent', {
    p_conversation_id: input.conversationId, p_actor_profile_id: input.actorProfileId,
    p_external_message_id: input.externalMessageId, p_observed_sender: input.observedSender,
    p_body: input.body, p_payload: input.payload,
  })
  if (error) throw new Error(`Atomic conversation enqueue failed: ${error.message ?? 'database error'}`)
  const result = data as Partial<AtomicIntentResult> | null
  if (!result || typeof result.intentId !== 'string' || typeof result.messageId !== 'string'
    || (result.jobId !== null && typeof result.jobId !== 'string') || typeof result.duplicate !== 'boolean') {
    throw new Error('Atomic conversation enqueue returned an invalid result')
  }
  return result as AtomicIntentResult
}
