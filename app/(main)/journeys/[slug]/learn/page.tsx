import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getJourneyPlayerView } from '@/lib/journeys/store'
import { getMemberRunForPlan, getCohortProgress } from '@/lib/journeys/runs'
import { JourneyPlayer } from '@/components/journey/v2/journey-player'
import { CohortMeter } from '@/components/journey/v2/cohort-meter'
import type { CohortProgress } from '@/lib/journeys/cohort'

// Journeys v2 — the learner player route (ADR-252, J1b). The clean, focused "take this journey"
// surface. Renders the Phase → Module → Lesson tree for the signed-in member. Works on existing
// (flat) journeys too — the tree wraps loose lessons in an implicit phase — so it's reachable
// before the full v2 cutover (J5).
export const dynamic = 'force-dynamic'

export default async function JourneyLearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) redirect('/onboarding')

  const profileId = (profile as { id: string }).id
  const view = await getJourneyPlayerView(slug, profileId)
  if (!view) notFound()

  // If the member is in a Circle Run of this Journey, show the shared cohort meter.
  // Best-effort: hidden (and harmless) until the Runs tables are live.
  let cohort: CohortProgress | null = null
  try {
    const run = await getMemberRunForPlan(profileId, view.plan.id)
    if (run) cohort = await getCohortProgress(run.id, view.plan.id)
  } catch {
    /* Runs not enabled yet */
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6">
      {cohort && <CohortMeter progress={cohort} />}
      <JourneyPlayer
        slug={slug}
        title={view.plan.title}
        emoji={view.plan.emoji}
        tree={view.tree}
        lessonsById={view.lessonsById}
      />
    </div>
  )
}
