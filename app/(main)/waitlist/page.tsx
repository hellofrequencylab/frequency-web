// The seeker waitlist (Growth OS Engine 3, GE3-1, ADR-456). Manifesto-first: a plain
// line about what this is, then the join. A signed-in member who already joined sees
// their position instead of the form. Composes the Focus kit. Copy is CONTENT-VOICE
// (plain, skeptic test, no narrated feelings, no em dashes). The referral-position +
// share mechanics (GE3-5) are deferred; this ships the join + position.

import { FocusTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { getCallerProfile } from '@/lib/auth'
import { getMyWaitlistEntry } from '@/lib/applications/store'
import { WaitlistJoin } from './waitlist-join'

export const dynamic = 'force-dynamic'

export default async function WaitlistPage() {
  const me = await getCallerProfile()
  const existing = me ? await getMyWaitlistEntry(me.id, 'seeker') : null

  return (
    <FocusTemplate
      eyebrow="Waitlist"
      title="Be first when a Circle opens near you."
      description="We open Frequency city by city, so nobody lands in an empty room. Leave your spot and we will tell you the moment your area is live."
      width="default"
    >
      {existing && existing.status !== 'removed' ? (
        <EmptyState
          variant="cleared"
          title="You are on the list."
          description={
            existing.position
              ? `You are number ${existing.position} in line. We will reach out the moment your area opens.`
              : 'We have your spot. We will reach out the moment your area opens.'
          }
        />
      ) : (
        <WaitlistJoin signedIn={!!me} />
      )}
    </FocusTemplate>
  )
}
