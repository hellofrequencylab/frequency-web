import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { ListingSpark } from '../listing-spark'

// Post a Classifieds listing (ADR-148 · docs/STUDIO.md §0, ADR-986). The board is connect-only and
// free: the gate is simply "signed in", which is exactly what createListingAction re-checks.
//
// The Spark brings its own centered column, progress cue, and heading, so this page mounts it
// directly rather than wrapping it in a second shell. Deep-linkable by design (STUDIO.md §1).

// A signed-out request is sent to sign-in below, but the shell has already streamed by then, so a
// crawler gets a 200 with this title and no canonical (measured on production 2026-11-19, SCAN-1274).
// The composer is nobody's search result: say so in the head.
export const metadata = { title: 'Post a listing', robots: { index: false, follow: false } }

export default async function NewListingPage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/classifieds/new')

  return <ListingSpark />
}
