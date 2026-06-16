import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { JourneyBuilder } from '@/components/journey/v2/journey-builder'

// Create a Journey (ADR-301). The single-page editor opens in DRAFT mode: the whole layout is
// there (cover header, click-to-edit Title + subtitle, the Vera composer, three phase boxes, and
// the settings sidebar), but NOTHING persists until the author names it. Committing a title creates
// the row + three phases and drops them into the live editor — so pushing "New journey" never
// leaves an untitled draft behind.
export const dynamic = 'force-dynamic'

export default async function NewJourneyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  return <JourneyBuilder draft />
}
