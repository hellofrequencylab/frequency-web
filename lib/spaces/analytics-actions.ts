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
import { createAdminClient } from '@/lib/supabase/admin'
import { headers } from 'next/headers'
import { claimOnce, rateLimitOk } from '@/lib/rate-limit'
import { verifySpaceCtaClickToken } from '@/lib/spaces/cta-click-token'

/** Record one primary-CTA click on a Space profile, tagged with `space_id`. The actor is resolved
 *  server-side (anonymous viewers still count as null). Fail-safe: never throws, returns void. */
export async function recordSpaceCtaClickAction(spaceId: string, token: string): Promise<void> {
  if (!spaceId || !token) return
  try {
    // A client-supplied Space id alone is not evidence of an impression or click. The token is
    // minted only while rendering a real CTA, binds the Space and surface, expires quickly, and
    // carries the event idempotency nonce. Resolve the public state again so an old token cannot
    // keep counting after the Space is made private, suspended, or archived.
    const proof = verifySpaceCtaClickToken(token, spaceId)
    if (!proof) return

    const { data, error } = await createAdminClient()
      .from('spaces')
      .select('status, visibility, type')
      .eq('id', spaceId)
      .maybeSingle()
    if (error || !data || data.status !== 'active' || data.visibility === 'private' || data.type === 'root') return

    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!(await rateLimitOk('space-cta-click', ip, 60, '60 s'))) return

    // The limiter is a useful early rejection; the ledger's unique key remains the durable
    // replay guard if Redis is unavailable or two requests race.
    if (!(await claimOnce(`space-cta-click:${proof.nonce}`, 10 * 60))) return

    const viewerProfileId = await getMyProfileId()
    await recordSpaceCtaClick(spaceId, viewerProfileId, proof.nonce)
  } catch {
    // Best-effort telemetry: a CTA click must never fail because the ledger hiccuped.
  }
}
