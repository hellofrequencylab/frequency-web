// On Air — the practice timer mini-app (ADR-229, docs/ON-AIR.md). A Focus
// surface (page-chrome 'none'): pick a practice, go on air, breathe, then the
// reveal pays out through the existing economy. The page only assembles the
// member's adopted practices + remembered setup; everything live is client.

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { loadOnAirSessionData } from '@/lib/on-air/session-data'
import { FocusTemplate } from '@/components/templates'
import { OnAirSession } from '@/components/on-air/session'
import { SITE_DESIGN } from '@/lib/theme/design'
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
    // FREQUENCY (ADR-1737): the same empty state, in the members kit.
    if (SITE_DESIGN === 'frequency') return <MindlessEmpty />
    return (
      <FocusTemplate
        eyebrow="Mindless"
        title="Mindless"
        description="The world can wait a few minutes. Breathe, log, collect the day."
        width="narrow"
        divider={false}
      >
        <div className="rounded-card border border-border bg-surface p-6 text-center">
          <p className="text-body-sm font-medium text-text">Nothing on your list yet.</p>
          <p className="mt-1 text-body-sm text-muted">
            Adopt a practice first; then this is where you do it.
          </p>
          <Link
            href="/practices"
            className="mt-4 inline-block rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary hover:bg-primary-hover"
          >
            Browse practices
          </Link>
        </div>
      </FocusTemplate>
    )
  }

  // FREQUENCY (ADR-1737): the reference's door (Tune out, a length, Start) in front of the same engine.
  if (SITE_DESIGN === 'frequency') {
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

  return (
    <OnAirSession
      practices={practices}
      defaultPracticeId={defaultPracticeId}
      prefs={prefs}
      practicedToday={practicedToday}
      journeyLegs={journeyLegs}
    />
  )
}
