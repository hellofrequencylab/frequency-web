// Start a Space's tools from its niche (ADR-1882). The IO half of niche-defaults.ts: it resolves the niche's
// bundle and hands it to the one bundle writer, so there is still a single answer to "what is on". Best
// effort and logged, never throwing, like the rest of a Space's birth. Subtractive only: it cannot grant.

import { nicheBundle } from '@/lib/spaces/niche-defaults'
import { setSpaceBundle } from '@/lib/pricing/space-bundle'

/** Apply the niche's preset to a Space that now exists. Returns whether one was applied. */
export async function startSpaceFromNiche(spaceId: string, niche: string | null | undefined): Promise<boolean> {
  const bundle = nicheBundle(niche)
  if (!bundle) return false
  try {
    const applied = await setSpaceBundle(spaceId, bundle.id)
    if (!applied.ok) console.error(`[spaces/niche] "${bundle.id}" not applied to ${spaceId}: ${applied.reason}`)
    return applied.ok
  } catch (err) {
    console.error(`[spaces/niche] "${bundle.id}" threw for ${spaceId}:`, err)
    return false
  }
}
