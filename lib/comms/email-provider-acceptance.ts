// Called only at the actual provider boundary. Do not taint legacy client-reachable email renderers
// with a new server-only import: lib/email.ts's existing graph must remain buildable.
import { createAdminClient } from '@/lib/supabase/admin'
import { TerminalQueueError } from '@/lib/queue/terminal-error'
import type { CreateEmailOptions } from 'resend'

type ProviderResult = { data: { id?: string } | null; error: unknown }
type Sender = (payload: CreateEmailOptions, options: { idempotencyKey: string }) => Promise<ProviderResult>
type Prepared = { state: string; providerId?: string; idempotencyKey?: string; nonce?: string; payload?: CreateEmailOptions }
interface Rpc { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string; message?: string } | null }> }
export function providerAcceptanceEnabled() { return process.env.EMAIL_PROVIDER_ACCEPTANCE_ENABLED === 'true' }

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await (createAdminClient() as unknown as Rpc).rpc(name, args)
  if (result.error) {
    if (result.error.code === '22023' || result.error.code === '42501') throw new TerminalQueueError(`Email acceptance held: ${result.error.message ?? 'invalid attempt'}`)
    throw new Error(`Email acceptance ledger unavailable: ${result.error.message ?? 'database error'}`)
  }
  return result.data
}

/** Trusted claimed job only; acknowledgement replay never invokes the provider. */
export async function readAcceptedEmailForJob(queueJobId: string): Promise<{ id: string } | null> {
  const result = await rpc('read_accepted_email_provider_attempt', { p_queue_job_id: queueJobId }) as { providerId?: unknown } | null
  return typeof result?.providerId === 'string' ? { id: result.providerId } : null
}

/** Preserve unknown acceptance across timeout/crash; only an explicit provider acceptance resolves it. */
export async function acceptEmailForJob(queueJobId: string, payload: CreateEmailOptions, send: Sender): Promise<{ id: string }> {
  const prepared = await rpc('prepare_email_provider_attempt', { p_queue_job_id: queueJobId, p_payload: payload }) as Prepared | null
  if (prepared?.state === 'accepted' && typeof prepared.providerId === 'string') return { id: prepared.providerId }
  if (prepared?.state === 'held' || prepared?.state === 'failed') throw new TerminalQueueError(`Email acceptance ${prepared.state}; reconcile before retry`)
  if (prepared?.state !== 'dispatching' || !prepared.idempotencyKey || !prepared.nonce || !prepared.payload) throw new Error('Invalid provider attempt acknowledgement')
  const settle = async (outcome: string, providerId: string | null, error: string | null) => {
    const committed = await rpc('settle_email_provider_attempt', { p_queue_job_id: queueJobId, p_nonce: prepared.nonce,
      p_outcome: outcome, p_provider_id: providerId, p_error: error })
    if (committed !== true) throw new Error('Provider settlement not committed; acceptance remains unresolved')
  }
  let result: ProviderResult
  try { result = await send(prepared.payload, { idempotencyKey: prepared.idempotencyKey }) }
  catch (error) {
    await settle('uncertain', null, 'provider transport failed; acceptance unknown')
    throw error
  }
  if (result.error) {
    const status = typeof result.error === 'object' && result.error !== null ? (result.error as { statusCode?: number }).statusCode : undefined
    const name = typeof result.error === 'object' && result.error !== null ? (result.error as { name?: string }).name : undefined
    const conflict = status === 409 && name === 'invalid_idempotent_request'
    const permanent = conflict || typeof status === 'number' && [400,401,403,404,422].includes(status)
    const retryable = status === 429 || (status === 409 && name === 'concurrent_idempotent_requests')
    await settle(permanent ? 'failed' : retryable ? 'retryable' : 'uncertain', null, `provider refusal ${status ?? 'unknown'}`)
    const message = `[email] send failed: ${JSON.stringify(result.error)}`
    if (permanent) throw new TerminalQueueError(message)
    throw new Error(message)
  }
  if (!result.data?.id) {
    await settle('uncertain', null, 'provider response omitted acceptance ID')
    throw new Error('Provider response omitted acceptance ID')
  }
  await settle('accepted', result.data.id, null)
  return { id: result.data.id }
}
