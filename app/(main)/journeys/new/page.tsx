import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { JourneySpark } from '@/components/journey/v2/journey-spark'

// Create a Journey (ADR-302). New Journeys open in the guided builder: Vera's short Spark wizard
// (who · about · outcome · weeks · pace) drafts the identity, then creates the row + one weekly
// Phase per week and drops the author into the editor. NOTHING persists until the author commits a
// reviewed title (no untitled drafts). "Skip — I'll build it myself" hands off to the manual draft
// editor. Refining (cover, story, practices, publish) happens in the editor.
export const dynamic = 'force-dynamic'

export default async function NewJourneyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  return <JourneySpark />
}
