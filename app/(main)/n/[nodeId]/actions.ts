'use server'

// Claim a physical node (QR / NFC / ghost). The whole pipeline runs server-side:
// verify → ledger (exactly-once) → capture → award zaps. See lib/engagement/*.

import { getMyProfileId } from '@/lib/auth'
import { captureNode } from '@/lib/engagement/capture'

export interface ClaimResult {
  ok: boolean
  reason?: string
  zapsAwarded?: number
  offerTitle?: string | null
}

export async function claimNode(
  nodeId: string,
  coords?: { lat: number; lng: number } | null,
  secret?: string | null,
): Promise<ClaimResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, reason: 'not_signed_in' }

  // Forward the device location (when the browser shared it) so location-aware
  // codes can verify proximity. Codes without a geofence ignore it.
  const location =
    coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
      ? { lng: coords.lng, lat: coords.lat }
      : null

  const result = await captureNode({
    nodeId,
    actorProfileId: profileId,
    location,
    presentedSecret: secret ?? null,
  })
  return {
    ok: result.ok,
    reason: result.reason,
    zapsAwarded: result.zapsAwarded,
    offerTitle: result.offerTitle,
  }
}
