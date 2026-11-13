import 'server-only'
// authz-delegated: a platform ledger (lifecycle_send_log, service role only) read and written by the lifecycle senders, which are the gate; there is no per-user resource to bind to.
// THE CROSS-EMAIL CAP, the IO half (EMAIL-047). A sender calls reserveLifecycleSend right before it enqueues: the cap decision
// (lib/lifecycle/cap.ts) over the person's last seven days, then a claim row unique by dedupe key so a second run cannot send
// twice. FAIL CLOSED: a read or write error answers 'error' and the sender skips and retries next run; it never sends unmetered.
// Dark until LIFECYCLE_CAP_ENABLED is set (docs/RUNBOOKS.md, "Lifecycle cap"); with it off the answer is always 'reserved'
// and nothing is read or written, which is how every sender behaves today.

import type { SupabaseClient } from '@supabase/supabase-js'
import { envFlag } from '@/lib/env/string'
import { log } from '@/lib/log'
import { capDecision } from './cap'

type Reservation = 'reserved' | 'capped' | 'duplicate' | 'error'

/** Postgres unique_violation: this dedupe key was already claimed. */
const UNIQUE_VIOLATION = '23505'

export async function reserveLifecycleSend(
  admin: SupabaseClient,
  input: { recipient: string; profileId?: string | null; kind: string; dedupeKey: string; now?: Date },
): Promise<Reservation> {
  if (!envFlag('LIFECYCLE_CAP_ENABLED')) return 'reserved'
  const now = input.now ?? new Date()
  const recipient = input.recipient.trim().toLowerCase()
  try {
    const since = new Date(now.getTime() - 7 * 86_400_000).toISOString()
    const { data, error } = await admin.from('lifecycle_send_log').select('kind, sent_at').eq('recipient', recipient).gte('sent_at', since)
    if (error) {
      log.error('lifecycle.cap.read_failed', { kind: input.kind, error: error.message })
      return 'error'
    }
    const recent = ((data as { kind: string; sent_at: string }[] | null) ?? []).map((r) => ({ kind: r.kind, sentAt: r.sent_at }))
    const decision = capDecision(now, input.kind, recent)
    if (!decision.allowed) {
      log.info('lifecycle.cap.held', { kind: input.kind, why: decision.why, retry_after: decision.retryAfter })
      return 'capped'
    }
    const { error: claimError } = await admin
      .from('lifecycle_send_log')
      .insert({ recipient, profile_id: input.profileId ?? null, kind: input.kind, dedupe_key: input.dedupeKey, sent_at: now.toISOString() })
    if (claimError) {
      if (claimError.code === UNIQUE_VIOLATION) return 'duplicate'
      log.error('lifecycle.cap.claim_failed', { kind: input.kind, error: claimError.message })
      return 'error'
    }
    return 'reserved'
  } catch (e) {
    log.error('lifecycle.cap.failed', { kind: input.kind, error: e instanceof Error ? e.message : String(e) })
    return 'error'
  }
}
