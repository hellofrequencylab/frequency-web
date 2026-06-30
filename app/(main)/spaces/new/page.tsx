import { redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { listModeChoices } from '@/lib/spaces/modes'
import { CreateSpaceForm } from './create-space-form'

// CREATE A SPACE — the Focus compose surface (ENTITY-SPACES-BUILD Wave B, Epic 1.6; Space Modes M3,
// ADR-461/464). A centered, no-rail form. An authenticated member answers "what do you run?" (which maps
// to a Mode + Focus), then fills name / handle / brand name / visibility; the createSpace action stands
// up the Space, seeds the Mode preset (the starter pipeline), and redirects to the owner settings surface.
//
// The "what do you run?" CHOICES come straight from the Mode registry (listModeChoices, plan §3a), so the
// wizard auto-includes every operating model the registry offers (no hardcoded list here) and each choice
// resolves to a (type, variant) the profile shell + the console both render.

export const metadata = {
  title: 'Create a space',
  description: 'Stand up a space for your practice, business, or organization on Frequency.',
  // An authenticated compose surface, not a content page: keep it out of the index and answer
  // engines (it only redirects a signed-out crawler to /sign-in).
  robots: { index: false, follow: false },
}

export default async function NewSpacePage() {
  // Gate: only an authenticated member may create a space (the action re-checks server-side).
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const choices = listModeChoices()

  return (
    <FocusTemplate
      eyebrow="Spaces"
      title="Create a space"
      description="Set up a home for your practice, business, or organization. You can change everything later."
      back={{ href: '/spaces/directory', label: 'Spaces' }}
    >
      <CreateSpaceForm choices={choices} />
    </FocusTemplate>
  )
}
