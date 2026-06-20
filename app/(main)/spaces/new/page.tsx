import { redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { provisionableTypes } from '@/lib/spaces/blueprints'
import { CreateSpaceForm, type SpaceTypeChoice } from './create-space-form'

// CREATE A SPACE — the Focus compose surface (ENTITY-SPACES-BUILD Wave B, Epic 1.6). A centered,
// no-rail form (the rail is registered 'none' for /spaces/new in lib/layout/page-chrome.ts). An
// authenticated member fills type / name / handle / brand name / visibility; the createSpace action
// stands up the Space and redirects here to the owner settings surface.
//
// The TYPE choices are the role types that have a registered blueprint, derived at render straight
// from the blueprint registry (provisionableTypes), so the wizard auto-includes every wired role
// (no hardcoded type list here) and never offers a type the profile shell can't render. This is the
// single source of truth for "provisionable" (ADR-339), so Lab + Partner appear the moment their
// blueprints register (ADMIN-05 / ADR-341), even though the public directory does not list them.

export const metadata = {
  title: 'Create a space',
  description: 'Stand up a space for your practice, business, or organization on Frequency.',
  // An authenticated compose surface, not a content page: keep it out of the index and answer
  // engines (it only redirects a signed-out crawler to /sign-in).
  robots: { index: false, follow: false },
}

/** The types a blueprint is registered for, in the canonical role order. Auto-expands as more role
 *  blueprints are wired (lib/spaces/blueprints.ts), with no edit here. */
function blueprintedTypes(): SpaceTypeChoice[] {
  return provisionableTypes()
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
