// Capture orchestration — the end-to-end physical engagement flow
// (docs/ENGAGEMENT-ARCHITECTURE.md): VERIFY → LEDGER (exactly-once) → record the
// capture → award zaps. Server-only.
//
// Physical/in-person sources earn ZAPS (currencyForSource); the amount is the
// node's tunable `zaps_value`. Reward is granted only on the first verified
// capture (the ledger's idempotency_key guards against retries / double taps).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { awardZaps } from '@/lib/zaps'
import { verifyCapture, type CaptureAttempt, type VerifyReason } from './verify'
import { recordEngagementEvent } from './events'
import { currencyForSource } from './currency'
import type { EngagementSource } from './events'

// node.type → engagement source. Ghost nodes are a geo source.
const NODE_TYPE_SOURCE: Record<string, EngagementSource> = {
  qr: 'qr',
  nfc: 'nfc',
  ghost: 'geo',
}

export interface CaptureResult {
  ok: boolean
  reason?: VerifyReason | 'unknown_node' | 'already_captured'
  zapsAwarded?: number
}

/**
 * Verify and (if valid + first time) record a capture, then award the node's
 * zaps. Idempotent per (node, actor) for once-per-user / once-global nodes.
 *
 * NOTE: repeatable nodes need a request-scoped key appended to the idempotency
 * key so repeats aren't collapsed — pass it through `attempt` when that lands.
 */
export async function captureNode(attempt: CaptureAttempt): Promise<CaptureResult> {
  // 1) Server-authoritative verification (validity, signature, rule, proximity).
  const verdict = await verifyCapture(attempt)
  if (!verdict.ok) return { ok: false, reason: verdict.reason }

  // nodes/captures aren't in the generated Database types yet → untyped view.
  const db = createAdminClient() as unknown as SupabaseClient

  const { data: node } = await db
    .from('nodes')
    .select('type, zaps_value')
    .eq('id', attempt.nodeId)
    .maybeSingle()
  if (!node) return { ok: false, reason: 'unknown_node' }

  const source = NODE_TYPE_SOURCE[node.type as string] ?? 'qr'

  // 2) Ledger, exactly-once. (Verifier already enforced once-per-user via the
  //    captures table; this is the second guard against retries.)
  const { recorded } = await recordEngagementEvent({
    idempotencyKey: `node:${attempt.nodeId}:${attempt.actorProfileId}`,
    source,
    eventType: 'node_capture',
    actorProfileId: attempt.actorProfileId,
    context: { nodeId: attempt.nodeId },
    verifiedAt: new Date(),
  })
  if (!recorded) return { ok: false, reason: 'already_captured' }

  // 3) Audit row.
  await db.from('captures').insert({
    node_id: attempt.nodeId,
    actor_profile_id: attempt.actorProfileId,
    verified: true,
  })

  // 4) Reward — physical = zaps.
  const amount = Number(node.zaps_value ?? 0)
  if (amount > 0 && currencyForSource(source) === 'zaps') {
    await awardZaps(attempt.actorProfileId, amount)
  }

  return { ok: true, zapsAwarded: amount > 0 ? amount : 0 }
}
