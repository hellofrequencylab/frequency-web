import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { HuntModerationScreen } from '@/components/hunts/moderation-screens'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { loadModerationScope, moderationReader } from '@/lib/hunts/moderation-store'

export const dynamic = 'force-dynamic'

// THE MODERATION QUEUE (FH-018S): the Trails with open reports that this member may pause or close. Dark
// until HUNTS_AUTHORING_ENABLED (and HUNTS_ENABLED) is on, then it 404s like a page that does not exist.
// The scope is resolved here from live authorization (Hunt roles and owner Space standing, decide), never
// from browser input; the reader applies it on every read and returns reasons and counts, never reporters.
// A member who may moderate nothing sees "Access required". The actions re-check on the server per call.
export const metadata: Metadata = { title: 'Trail moderation', robots: { index: false } }

export default async function HuntModerationPage() {
  if (!huntSwitchOn('authoring')) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/hunts/moderation')
  const scope = await loadModerationScope(profileId)
  return <HuntModerationScreen scope={scope} reader={moderationReader} canAct />
}
