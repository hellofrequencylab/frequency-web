import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getJourneyPlayerView } from '@/lib/journeys/store'
import { JourneyPlayer } from '@/components/journey/v2/journey-player'

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

  const view = await getJourneyPlayerView(slug, (profile as { id: string }).id)
  if (!view) notFound()

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
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
