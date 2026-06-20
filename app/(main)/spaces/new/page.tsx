import { redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { blueprintForType } from '@/lib/spaces/blueprints'
import { DIRECTORY_TYPES } from '@/components/spaces/space-type'
import { CreateSpaceForm, type SpaceTypeChoice } from './create-space-form'

// CREATE A SPACE — the Focus compose surface (ENTITY-SPACES-BUILD Wave B, Epic 1.6). A centered,
// no-rail form (the rail is registered 'none' for /spaces/new in lib/layout/page-chrome.ts). An
// authenticated member fills type / name / handle / brand name / visibility; the createSpace action
// stands up the Space and redirects here to the owner settings surface.
//
// The TYPE choices are the role types that have a registered blueprint — derived at render from the
// canonical type map filtered through blueprintForType, so the wizard auto-includes every wired
// role (no hardcoded type list) and never offers a type the profile shell can't render.

export const metadata = {
  title: 'Create a space',
  description: 'Stand up a space for your practice, business, or organization on Frequency.',
  // An authenticated compose surface, not a content page: keep it out of the index and answer
  // engines (it only redirects a signed-out crawler to /sign-in).
  robots: { index: false, follow: false },
}

/** The types a blueprint is registered for, in the canonical directory order. Auto-expands as more
 *  role blueprints are wired (lib/spaces/blueprints.ts), with no edit here. */
function blueprintedTypes(): SpaceTypeChoice[] {
  return DIRECTORY_TYPES.filter((t) => blueprintForType(t.value) !== null).map((t) => ({
    value: t.value,
    label: t.label,
  }))
}

export default async function NewSpacePage() {
  // Gate: only an authenticated member may create a space (the action re-checks server-side).
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const types = blueprintedTypes()

  return (
    <FocusTemplate
      eyebrow="Spaces"
      title="Create a space"
      description="Set up a home for your practice, business, or organization. You can change everything later."
      back={{ href: '/spaces', label: 'Spaces' }}
    >
      <CreateSpaceForm types={types} />
    </FocusTemplate>
  )
}
