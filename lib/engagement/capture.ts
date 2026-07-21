// Capture orchestration — the end-to-end physical engagement flow
// (docs/ENGAGEMENT-ARCHITECTURE.md): VERIFY → LEDGER (exactly-once) → record the
// capture → award zaps. Server-only.
//
// Physical/in-person sources earn ZAPS (currencyForSource); the amount is the
// node's tunable `zaps_value`. Reward is granted only on the first verified
// capture (the ledger's idempotency_key guards against retries / double taps).

import { createAdminClient } from '@/lib/supabase/admin'
import { awardZaps } from '@/lib/zaps'
import { verifyCapture, type CaptureAttempt, type VerifyReason } from './verify'
import { recordEngagementEvent } from './events'
import { currencyForSource } from './currency'
import { trustSource } from '@/lib/trust'
import { recordSpaceMemberActivity } from '@/lib/crm/interactions'
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
  /** Title of the partner offer unlocked, when the node is a partner plaque. */
  offerTitle?: string | null
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

  const db = createAdminClient()

  const { data: node } = await db
    .from('nodes')
    .select('type, zaps_value, partner_id, kind, space_id')
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

  // 3b) A SPACE CHECK-IN also lands on the member's Space Resonance timeline (event attendance, ADR-796).
  // Only for a check-in node (never an ordinary QR/NFC/ghost capture), best-effort, and keyed on
  // (node, actor) so a retry never double-logs. Resolve the Space owner (the book it lands in) lazily.
  if ((node.kind as string) === 'checkin' && typeof node.space_id === 'string' && node.space_id) {
    try {
      // Resolve the Space owner via the client already in hand (no new module dependency in this shared
      // engagement path — avoids an import cycle risk).
      const { data: sp } = await db
        .from('spaces')
        .select('owner_profile_id')
        .eq('id', node.space_id)
        .maybeSingle()
      await recordSpaceMemberActivity({
        spaceId: node.space_id,
        spaceOwnerProfileId: (sp?.owner_profile_id as string | null) ?? null,
        memberProfileId: attempt.actorProfileId,
        channel: 'in_person',
        summary: 'Checked in',
        idempotencyKey: `checkin:${attempt.nodeId}:${attempt.actorProfileId}`,
        metadata: { kind: 'event_checkin', nodeId: attempt.nodeId },
      })
    } catch {
      /* best-effort: a timeline write never breaks the capture */
    }
  }

  // 4) Reward — physical = zaps.
  const amount = Number(node.zaps_value ?? 0)
  if (amount > 0 && currencyForSource(source) === 'zaps') {
    await awardZaps(attempt.actorProfileId, amount, {
      actionType: 'node_capture',
      metadata: { nodeId: attempt.nodeId },
    })
  }

  // 4b) A proximity-verified physical capture is also a verified practice (the
  //     actor was really there), except purely commercial partner-plaque bumps.
  //     Emit the North-Star event once per (node, actor), keyed independently
  //     from the capture above.
  if (!node.partner_id) {
    await recordEngagementEvent({
      idempotencyKey: `practice_node:${attempt.nodeId}:${attempt.actorProfileId}`,
      source,
      eventType: 'practice.verified',
      actorProfileId: attempt.actorProfileId,
      context: { nodeId: attempt.nodeId, kind: 'node_practice' },
      verifiedAt: new Date(),
    }).catch(() => {})

    // A proximity-verified, non-commercial capture is genuine in-person presence — a
    // community trust signal (ADR-247). Idempotent per (node, actor); best-effort so it
    // never blocks the capture, and a safe no-op until trust_signals is applied.
    await trustSource('community')
      .signal({
        profileId: attempt.actorProfileId,
        signalType: 'in_person_checkin',
        context: 'community',
        idempotencyKey: `checkin:${attempt.nodeId}:${attempt.actorProfileId}`,
        meta: { nodeId: attempt.nodeId },
      })
      .catch(() => {})
  }

  // 5) Partner plaque → log a redemption + surface the unlocked offer.
  let offerTitle: string | null = null
  if (node.partner_id) {
    const { data: offer } = await db
      .from('partner_offers')
      .select('id, title')
      .eq('partner_id', node.partner_id)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    await db.from('partner_redemptions').insert({
      partner_id: node.partner_id,
      offer_id: offer?.id ?? null,
      profile_id: attempt.actorProfileId,
      source,
    })
    offerTitle = offer?.title ?? null
  }

  return { ok: true, zapsAwarded: amount > 0 ? amount : 0, offerTitle }
}
