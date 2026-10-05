import 'server-only'
import { getJourneyCapabilities } from '@/lib/core/load-capabilities'
import { isPlanAdopted } from '@/lib/journey-plans'
import type { JourneyEntryFacts } from '@/lib/journeys/entry-gate'

// THE DOOR'S FACTS, resolved (ADR-1397). The pure rule stays in entry-gate.ts (canEnterJourney); this
// loads the two facts it needs, the viewer's capabilities on the Journey and their enrolment, so the
// learn page and the lesson-complete action feed the gate from ONE place and cannot drift (SCAN-725:
// the action used to skip the door the page enforced).

/** Load what canEnterJourney needs for one viewer on one Journey. Two reads, in parallel. */
export async function loadJourneyEntryFacts(
  viewerProfileId: string,
  plan: { id: string; author_id: string | null },
): Promise<JourneyEntryFacts> {
  const [caps, enrolled] = await Promise.all([getJourneyCapabilities(plan.id), isPlanAdopted(viewerProfileId, plan.id)])
  return { viewerProfileId, authorId: plan.author_id, canManage: caps.has('journey.editSettings'), enrolled }
}
