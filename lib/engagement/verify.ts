// Server-authoritative verification for physical engagement triggers (QR / NFC /
// ghost nodes). GPS and QR/NFC payloads are trivially spoofable, so a capture is
// only trusted after the SERVER clears it here - never the device.
// See docs/ENGAGEMENT-ARCHITECTURE.md §2.
//
// This module verifies; it does not grant rewards. The caller pairs a successful
// verification with `recordEngagementEvent` (lib/engagement/events.ts) once the
// reward economy is defined.

import { createAdminClient } from '@/lib/supabase/admin'

export interface CaptureAttempt {
  nodeId: string
  actorProfileId: string
  /** The signed value carried by the QR/NFC payload, if the node requires one. */
  presentedSecret?: string | null
  /** Device-reported position; required when the node sets a proximity radius. */
  location?: { lng: number; lat: number } | null
}

export type VerifyReason =
  | 'unknown_node'
  | 'inactive'
  | 'not_yet_valid'
  | 'expired'
  | 'bad_signature'
  | 'already_captured'
  | 'location_required'
  | 'too_far'

export interface VerifyResult {
  ok: boolean
  reason?: VerifyReason
}

/**
 * Run every server-side check for a capture attempt. Pure verification - no
 * writes, no rewards. Returns ok:true only when the node is live, the signature
 * (if any) matches, the capture rule allows it, and proximity (if required) holds.
 */
export async function verifyCapture(attempt: CaptureAttempt): Promise<VerifyResult> {
  const db = createAdminClient()

  const { data: node } = await db
    .from('nodes')
    .select('active, secret, capture_rule, proximity_m, location, valid_from, valid_until')
    .eq('id', attempt.nodeId)
    .maybeSingle()

  if (!node) return { ok: false, reason: 'unknown_node' }
  if (!node.active) return { ok: false, reason: 'inactive' }

  const now = Date.now()
  if (node.valid_from && new Date(node.valid_from).getTime() > now) return { ok: false, reason: 'not_yet_valid' }
  if (node.valid_until && new Date(node.valid_until).getTime() < now) return { ok: false, reason: 'expired' }

  // Signed payload: a node with a secret only accepts the matching value.
  if (node.secret && attempt.presentedSecret !== node.secret) {
    return { ok: false, reason: 'bad_signature' }
  }

  // Capture rule: block repeats for one-shot nodes.
  if (node.capture_rule === 'once_per_user' || node.capture_rule === 'once_global') {
    let q = db
      .from('captures')
      .select('id', { count: 'exact', head: true })
      .eq('node_id', attempt.nodeId)
      .eq('verified', true)
    if (node.capture_rule === 'once_per_user') q = q.eq('actor_profile_id', attempt.actorProfileId)
    const { count } = await q
    if ((count ?? 0) > 0) return { ok: false, reason: 'already_captured' }
  }

  // Proximity: delegate the geo math to PostGIS via the SECURITY DEFINER RPC.
  if (node.proximity_m != null && node.location != null) {
    if (!attempt.location) return { ok: false, reason: 'location_required' }
    const { data: inRange } = await db.rpc('node_within_range', {
      p_node_id: attempt.nodeId,
      p_lng: attempt.location.lng,
      p_lat: attempt.location.lat,
    })
    if (inRange !== true) return { ok: false, reason: 'too_far' }
  }

  return { ok: true }
}
