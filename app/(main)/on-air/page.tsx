// On Air — the practice timer mini-app (ADR-229, docs/ON-AIR.md). A Focus
// surface (page-chrome 'none'): pick a practice, go on air, breathe, then the
// reveal pays out through the existing economy. The page only assembles the
// member's adopted practices + remembered setup; everything live is client.

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { loadOnAirSessionData } from '@/lib/on-air/session-data'
import { MindlessEmpty } from '@/components/frequency/members/mindless/mindless-empty'
import { MindlessDoor } from '@/components/frequency/members/mindless/mindless-door'

export const metadata: Metadata = {
  title: 'Mindless',
  description: 'Your daily practice timer: breathe, log, and collect the day.',
}

export default async function OnAirPage({
  searchParams,
}: {
  searchParams: Promise<{ practice?: string }>
}) {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')
  const { practice: requested } = await searchParams

  // Member state assembled by the shared loader — same source the global
  // Mindless overlay uses, so the route and the overlay always agree.
  const { practices, defaultPracticeId, prefs, practicedToday, journeyLegs } = await loadOnAirSessionData(
    profileId,
    requested,
  )

  // The session is a full-page takeover from the first screen (ADR-229 P8):
  // entering Mindless means no app chrome at all. The Focus shell only hosts
  // the empty "adopt a practice first" state.
  if (practices.length === 0) {
  return <MindlessEmpty />
  }
  const initialId =
    defaultPracticeId ?? practices.find((p) => !p.loggedToday)?.id ?? practices[0]?.id ?? ''
  return (
    <MindlessDoor
      session={{ practices, defaultPracticeId, prefs, practicedToday, journeyLegs }}
      initialPracticeId={initialId}
      rememberedMinutes={prefs.minutes}
    />
  )
}
