import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { ListingSpark } from '../listing-spark'

// Post a Classifieds listing (ADR-148 · docs/STUDIO.md §0, ADR-986). The board is connect-only and
// free: the gate is simply "signed in", which is exactly what createListingAction re-checks.
//
// The Spark brings its own centered column, progress cue, and heading, so this page mounts it
// directly rather than wrapping it in a second shell. Deep-linkable by design (STUDIO.md §1).

export const metadata = { title: 'Post a listing' }

export default async function NewListingPage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/classifieds/new')

  return <ListingSpark />
}
