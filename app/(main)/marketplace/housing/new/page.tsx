import { redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { HousingForm } from './housing-form'

// List housing — a centered compose surface (Focus, no rail). Connect-only: no rent is
// processed in-app, a member messages you to arrange it. Roommate listings opt into the
// resonance match on the seeker side; this is the listing half. The form itself is a
// client component (it hosts the photo gallery), so this page just gates + frames it.

export const metadata = { title: 'List housing' }

export default async function NewHousingPage() {
  const viewerProfileId = await getMyProfileId()
  if (!viewerProfileId) redirect('/sign-in?next=/marketplace/housing/new')

  return (
    <FocusTemplate
      title="List housing"
      description="A rental, a sublet, or a room with a roommate. No fees and no payment to set up. Members reach you by message."
      back={{ href: '/marketplace/housing', label: 'Housing' }}
      width="wide"
    >
      <HousingForm />
    </FocusTemplate>
  )
}
