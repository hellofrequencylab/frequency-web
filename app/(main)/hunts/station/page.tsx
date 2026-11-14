import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { StationTerminal } from '@/components/hunts/station-terminal'
import { FocusTemplate } from '@/components/templates'
import { huntSwitchOn } from '@/lib/hunts/flags'

export const dynamic = 'force-dynamic'

// THE MERCHANT STATION (FH-022): where a venue's staff hand over a reward a player earned. Dark until
// HUNTS_REWARDS_ENABLED (and its parents) is on, then it 404s like a page that does not exist. Who may
// hand over what is decided on the server for each look-up (lib/hunts/redemption.ts, decide), never by
// being on this page: a signed-in member who is not staff of that Trail learns nothing about a code.
export const metadata: Metadata = { title: 'Redemption station', robots: { index: false } }

export default async function StationPage() {
  if (!huntSwitchOn('rewards')) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/hunts/station')

  return (
    <FocusTemplate
      eyebrow="Frequency Hunts"
      title="Redemption station"
      description="Enter the code a player shows you, check what it is, and hand it over once."
      width="default"
      adminBar={false}
    >
      <StationTerminal />
    </FocusTemplate>
  )
}
