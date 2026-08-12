'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { listPublicPlans } from '@/lib/journey-plans'
import type { JourneyOption } from '@/components/journey/v2/start-run-button'

// The read behind the "Start a Run" control in the circle admin rail (the `circle.engage` module).
//
// WHY IT LIVES HERE: the control used to be a page BLOCK in the circle's side column
// ('circle-journey-run'), where it fed the whole member column a host write action used weekly by
// one member in thirty. It moved to the rail, so it needs its own read rather than the page's
// request-scoped circle context.
//
// THE GATE IS UNCHANGED: the block gated on `circle.editSettings` (the page's `canManage`), and so
// does this. The read is fail-safe (a missing circle or a caller without the capability gets null,
// so the module renders nothing), and startJourneyRunAction still re-checks its OWN gate
// (lib/journeys/run-gate.ts) on every start. The gate here is UX; the action is law.

/** Mirrors the page block: offer the first slice of the public library, not the whole table. */
const RUNNABLE_JOURNEY_LIMIT = 50

export interface CircleJourneyRunData {
  circleId: string
  journeys: JourneyOption[]
}

export async function getCircleJourneyRunData(slug: string): Promise<CircleJourneyRunData | null> {
  const admin = createAdminClient()
  const { data: circle } = await admin.from('circles').select('id').eq('slug', slug).maybeSingle()
  if (!circle) return null

  const caps = await getCircleCapabilities(circle.id)
  if (!caps.has('circle.editSettings')) return null

  const journeys = (await listPublicPlans()).slice(0, RUNNABLE_JOURNEY_LIMIT).map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    emoji: p.emoji ?? null,
  }))
  return { circleId: circle.id, journeys }
}
