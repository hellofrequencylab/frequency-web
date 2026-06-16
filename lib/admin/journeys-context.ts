import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { rankedJourneys, type RankedJourney } from '@/lib/admin/content-signals'

// The shared data behind the admin Journeys curation surface (/admin/content/journeys). The page
// header and every journeys layout module (components/widgets/admin/admin-journeys-*) read this
// ONE request-cached resolver, so the ranked-journeys read + counts run once no matter how the
// operator has arranged the blocks. Access is gated by the page (requireAdmin); this is the read.

export interface AdminJourneysContext {
  journeys: RankedJourney[]
  /** Member submissions awaiting a decision. */
  pending: RankedJourney[]
  /** The public library (everything not pending). */
  library: RankedJourney[]
  officialCount: number
  adoptionCount: number
  /** Active Quests, for the Official control's Quest picker. */
  quests: { id: string; name: string }[]
}

export const getAdminJourneysContext = cache(async (): Promise<AdminJourneysContext> => {
  const admin = createAdminClient()
  const [journeys, { count: officialCount }, { count: adoptionCount }, { data: questRows }] = await Promise.all([
    rankedJourneys(),
    admin.from('journey_plans').select('id', { count: 'exact', head: true }).eq('official', true),
    admin.from('journey_plan_adoptions').select('id', { count: 'exact', head: true }).eq('active', true),
    admin.from('quests').select('id, name').eq('status', 'active').order('sort_order'),
  ] as const)

  const quests = (questRows ?? []) as { id: string; name: string }[]
  return {
    journeys,
    pending: journeys.filter((j) => j.status === 'pending'),
    library: journeys.filter((j) => j.status !== 'pending'),
    officialCount: officialCount ?? 0,
    adoptionCount: adoptionCount ?? 0,
    quests,
  }
})
