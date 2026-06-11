import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyProfileId } from '@/lib/auth'
import { FocusTemplate } from '@/components/templates'
import { Creator } from './creator'

export const dynamic = 'force-dynamic'

// Poster capture — the entry to the Poster Events flow: photograph a town
// poster, ONE vision call turns it into an event draft, the editor opens next.
// Focus chrome (lib/layout/page-chrome.ts); the heavy lifting is the client
// island (downscale, deskew, crops all happen on-device).
export default async function ScanPosterPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in?next=/events/scan')

  const profileId = await getMyProfileId()
  if (!profileId) redirect('/events')

  return (
    <FocusTemplate
      title="Capture an event poster"
      description="Snap a poster you spot around town. Vera reads it and builds an event draft you can tidy and post."
      back={{ href: '/events', label: 'Events' }}
      actions={
        <Link href="/events/drafts" className="text-sm font-medium text-primary-strong hover:underline">
          My drafts
        </Link>
      }
    >
      <Creator userId={user.id} />
    </FocusTemplate>
  )
}
