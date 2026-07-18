import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canCreate } from '@/lib/core/load-capabilities'
import { getCallerProfile } from '@/lib/auth'
import { isPaid } from '@/lib/core/access-matrix'
import { JourneySpark } from '@/components/journey/v2/journey-spark'
import { AuthoringAccessNote } from '@/components/pricing/authoring-access-note'
import { JOURNEY_TEMPLATES } from '@/lib/journeys/templates'

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
  // Real Crew (or steward/staff) may build a journey; a free member is bounced to the
  // library, where "New journey" shows the free-beta upgrade popup (ADR-414).
  if (!(await canCreate('journey.create'))) redirect('/journeys')

  const caller = await getCallerProfile()
  const paidOwner = isPaid(caller?.realMembershipTier)

  // Lightweight template metadata for the "Start from a template" picker. The full template trees
  // (lib/journeys/templates.ts) pull in server-only compose code, so we map to a client-safe shape
  // here and hand it to the wizard as props rather than importing it into the client bundle.
  const templates = JOURNEY_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    emoji: t.emoji,
    phases: t.phases.length,
    lessons: t.phases.reduce((n, p) => n + p.modules.reduce((m, mod) => m + mod.lessons.length, 0), 0),
  }))

  return (
    <>
      <div className="mx-auto w-full max-w-lg px-4 pt-6">
        <AuthoringAccessNote kind="journey" paidOwner={paidOwner} />
      </div>
      <JourneySpark templates={templates} />
    </>
  )
}
