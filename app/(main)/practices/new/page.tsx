import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canCreate } from '@/lib/core/load-capabilities'
import { PracticeSpark } from '@/components/studio/practice/practice-spark'

// Create a Practice (ADR-358), the atom-level twin of /journeys/new. New Practices open in the
// guided builder: Vera's short Spark wizard (who · the act · outcome · cadence · time) drafts the
// whole Practice, then creating it makes the row and drops the author into the editor. NOTHING
// persists until the author commits a reviewed title (deferred creation, like Journeys). "Skip,
// I'll build it myself" hands off to a blank draft in the editor. Refining (the guide, the Pillar,
// effort, publish) happens in the editor.
export const metadata: Metadata = { title: 'New practice' }
export const dynamic = 'force-dynamic'

export default async function NewPracticePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in?next=/practices/new')
  // Real Crew (or steward/staff) may author a practice; a free member is bounced to the
  // library, where "Create a practice" shows the free-beta upgrade popup (ADR-414).
  if (!(await canCreate('practice.create'))) redirect('/practices')

  return <PracticeSpark />
}
