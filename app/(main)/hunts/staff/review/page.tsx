import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { HuntHeldClaimsScreen } from '@/components/hunts/staff-proof-screens'
import { HeldClaimControls } from '@/components/hunts/held-claim-controls'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { loadHeldClaims } from '@/lib/hunts/staff-queue-store'

export const dynamic = 'force-dynamic'

// HELD CLAIMS (FH-020T): claims that need a staff decision, for the venues this member may edit. Dark
// until HUNTS_CLAIMS_ENABLED is on. The list is read fresh each request and the review action asks
// decide('review_claim') again before it writes.
export const metadata: Metadata = { title: 'Review held claims', robots: { index: false } }

export default async function HuntHeldClaimsPage() {
  if (!huntSwitchOn('claims')) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/hunts/staff/review')

  const held = await loadHeldClaims(profileId)
  return (
    <HuntHeldClaimsScreen
      claims={held.map((c) => ({
        reference: c.reference,
        reason: `${c.venueName} · ${c.reason}`,
        ageLabel: c.ageLabel,
        controls: <HeldClaimControls claimId={c.claimId} />,
      }))}
    />
  )
}
