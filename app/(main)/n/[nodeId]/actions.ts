'use server'

// Claim a physical node (QR / NFC / ghost). The whole pipeline runs server-side:
// verify → ledger (exactly-once) → capture → award zaps. See lib/engagement/*.

import { getMyProfileId } from '@/lib/auth'
import { captureNode } from '@/lib/engagement/capture'

export interface ClaimResult {
  ok: boolean
  reason?: string
  zapsAwarded?: number
}

export async function claimNode(nodeId: string): Promise<ClaimResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, reason: 'not_signed_in' }

  const result = await captureNode({ nodeId, actorProfileId: profileId })
  return { ok: result.ok, reason: result.reason, zapsAwarded: result.zapsAwarded }
}
