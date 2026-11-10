import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { TrailSpark } from '@/components/hunts/trail-spark'

// NEW TRAIL (FH-013, docs/hunts/CREATOR-FLOW.md step 1, "Name it"). The resident's own road into a
// Hunt: no Space is chosen and no graph is shown. Nothing persists until Continue on this screen
// (deferred creation, like every Spark); the stops, the shape, the preview and the publish happen in
// the editor the create lands on. Dark until HUNTS_AUTHORING_ENABLED is on: the route 404s like a
// page that does not exist. Signed out, it asks for a sign-in and comes back here.
export const metadata: Metadata = { title: 'New trail', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function NewTrailPage() {
  if (!huntSwitchOn('authoring')) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/hunts/new')
  return <TrailSpark />
}
