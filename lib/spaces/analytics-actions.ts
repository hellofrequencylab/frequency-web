'use server'

// THE CLIENT-CALLABLE SERVER ACTION for entity-profile telemetry (Epic 1.11, CTA-click tracking).
//
// A 'use server' module may export ONLY async functions, so the recorders + their idempotency logic
// live in lib/spaces/analytics.ts (no directive: pure-ish, unit-testable). This thin file is the seam
// the CLIENT CTA imports, so a click can record a `space.cta_click` event across the network boundary:
//   entity-cta-link.tsx (the primary CTA) -> recordSpaceCtaClickAction
//
// The viewer is resolved SERVER-SIDE (getMyProfileId), never trusted from the client, mirroring the
// view tracker. The whole thing is fire-and-forget + fail-safe: the recorder swallows its own errors,
// and this wrapper resolves void so a click never blocks navigation or surfaces a failure.

import { recordSpaceCtaClick } from '@/lib/spaces/analytics'
import { getMyProfileId } from '@/lib/auth'

/** Record one primary-CTA click on a Space profile, tagged with `space_id`. The actor is resolved
 *  server-side (anonymous viewers still count as null). Fail-safe: never throws, returns void. */
export async function recordSpaceCtaClickAction(spaceId: string): Promise<void> {
  if (!spaceId) return
  try {
    const viewerProfileId = await getMyProfileId()
    await recordSpaceCtaClick(spaceId, viewerProfileId)
  } catch {
    // Best-effort telemetry: a CTA click must never fail because the ledger hiccuped.
  }
}
