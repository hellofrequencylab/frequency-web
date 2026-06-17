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
  const { practices, defaultPracticeId, prefs, practicedToday } = await loadOnAirSessionData(
    profileId,
    requested,
  )

  // The session is a full-page takeover from the first screen (ADR-229 P8):
  // entering Mindless means no app chrome at all. The Focus shell only hosts
  // the empty "adopt a practice first" state.
  if (practices.length === 0) {
    return (
      <FocusTemplate
        eyebrow="The Quest"
        title="Mindless"
        description="The world can wait a few minutes. Breathe, log, collect the day."
        width="narrow"
        divider={false}
      >
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-sm font-medium text-text">Nothing on your list yet.</p>
          <p className="mt-1 text-sm text-muted">
            Adopt a practice first; then this is where you do it.
          </p>
          <Link
            href="/practices"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
          >
            Browse practices
          </Link>
        </div>
      </FocusTemplate>
    )
  }

  return (
    <OnAirSession
      practices={practices}
      defaultPracticeId={defaultPracticeId}
      prefs={prefs}
      practicedToday={practicedToday}
    />
  )
}
