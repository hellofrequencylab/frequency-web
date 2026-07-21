import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { CollaboratorsBody } from './collaborators-body'

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
  const featureLocked = !staffViewing && !spaceFunctionAccess(space, 'collaborators', caps.role)

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Collaborators"
      description="The businesses that operate inside your space, and requests to collaborate. Invite another business space; they approve, and you both show as collaborators."
      width={featureLocked ? undefined : 'wide'}
    >
      <CollaboratorsBody spaceId={space.id} slug={slug} manage={!featureLocked} />
    </FocusTemplate>
  )
}
