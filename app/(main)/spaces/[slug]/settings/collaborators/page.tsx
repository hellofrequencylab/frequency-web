import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { spaceCanHostCollaborators } from '@/lib/spaces/function-access'
import { resolveCollaboratorHostWall } from '@/lib/spaces/collaborator-host-gate'
import { CollaboratorsBody } from './collaborators-body'
import { SharedCollaboratorCalendar } from './shared-collaborator-calendar'
import { VenueHoldsSection } from './venue-holds-section'

// COLLABORATORS — the owner back-end surface for hosting other businesses inside this space (ADR-799
// B1-UI). A centered, no-rail Focus surface (the /spaces/<slug>/settings* rail pattern registers 'none'
// in page-chrome.ts). Gates render on canManage || staffViewing (404 otherwise, no existence leak).

export const metadata = { title: 'Collaborators' }

export default async function SpaceCollaboratorsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  // Locked when the viewer lacks the role OR the space is below the collaborator-host
  // wall (ADR-810 / LIVE-430, Business floor). A lower-plan space sees the surface + the
  // value but the controls are the upgrade prompt. While billing is OFF,
  // spaceCanHostCollaborators grants, so this stays today's behavior.
  const [planOk, wallLabel] = await Promise.all([
    spaceCanHostCollaborators(space),
    resolveCollaboratorHostWall(),
  ])
  const roleOk = spaceFunctionAccess(space, 'collaborators', caps.role)
  const featureLocked = !staffViewing && (!roleOk || !planOk)
  // Which lock to explain: a plan lock routes to the plans/billing surface; a role/module lock routes to
  // the Module Manager. The plan lock wins when both apply (the upgrade is the real blocker).
  const lockedReason: 'plan' | 'module' = !planOk ? 'plan' : 'module'

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Collaborators"
      description="The businesses that operate inside your space, and requests to collaborate. Invite another business space; they approve, and you both show as collaborators."
      width={featureLocked ? undefined : 'wide'}
    >
      <CollaboratorsBody
        spaceId={space.id}
        slug={slug}
        manage={!featureLocked}
        lockedReason={lockedReason}
        wallLabel={wallLabel}
      />
      {/* B3 first slice: the combined calendar of this space + its accepted collaborators (public events
          only, gated per source). Renders nothing when there are no accepted collaborators / events. */}
      {!featureLocked && <SharedCollaboratorCalendar spaceId={space.id} ownName={brandName} />}
      {/* B3 booking coordination: request/approve advisory venue holds between accepted collaborators. */}
      {!featureLocked && <VenueHoldsSection spaceId={space.id} />}
    </FocusTemplate>
  )
}
