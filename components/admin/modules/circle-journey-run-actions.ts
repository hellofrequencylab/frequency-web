'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { runnableJourneysForCircle } from '@/lib/journeys/run-gate'
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
//
// THE PICKER OFFERS EXACTLY WHAT THE ACTION ACCEPTS. The page block filled the dropdown from the
// whole public library while startJourneyRunAction only takes a Journey the OWNING SPACE offers, so
// on a Space circle most of the list was guaranteed to come back "Pick a Journey this space offers."
// `runnableJourneysForCircle` is the one seam that answers both questions the same way.
//
// The capability check stays even though that helper returns [] for a viewer who may not start a
// run: an empty list renders "No published journeys yet", and telling a member the library is empty
// is worse than not showing them a host control at all.

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

  // No profile id: the helper resolves the signed-in caller itself (passing null would mean
  // anonymous, and deny). Its default limit is the 50 the page block used.
  const journeys: JourneyOption[] = await runnableJourneysForCircle(circle.id)
  return { circleId: circle.id, journeys }
}
