import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceManageHref } from '@/lib/spaces/types'
import { canManageSpaceLoom } from '@/lib/library/space-loom-access'
import { listLoomScopeImages, listLoomScopeTags } from '@/lib/library/store'
import { loomMeter, loomQuotaFor, loomStorageUsed } from '@/lib/library/quota'
import { IndexTemplate } from '@/components/templates'
import { resolveIndexHero } from '@/lib/layout/index-hero'
import { SpaceLoomStudio } from '@/components/spaces/loom/space-loom-studio'

// THE SPACE LOOM STUDIO page (SPACE_MODULES `space.loom`): the full-page image-library manager for one Space.
// The counterpart to the popup LoomPicker — browse, upload, organize, and delete the Space's own images.
// Gated on the Space's own `loom` FUNCTION through canManageSpaceLoom (LIVE-566, ADR-1578): the on/off
// switch in spaces.entitlements and the min-role bar in spaces.feature_roles (code default editor), the same
// answer the /manage console uses to show or hide the tile. A Space that switched Loom Studio off, or raised
// its bar to admin, 404s an editor here the way it always 404d a member: no existence leak. The popup picker
// is a different door (it stays on canEditProfile), so an editor barred from the Studio still edits pages.

export const metadata: Metadata = { title: 'Loom Studio' }
export const dynamic = 'force-dynamic'

export default async function SpaceLoomStudioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!canManageSpaceLoom(space, caps.role)) notFound()

  const brandName = space.brandName ?? space.name
  // The storage meter (LIVE-567): what this Loom stores against its cap. loomStorageUsed never
  // throws, so a failed read renders as words in the Studio and never holds the page.
  const [initialAssets, initialTags, usage] = await Promise.all([
    listLoomScopeImages({ spaceId: space.id }, { kinds: ['image'] }),
    listLoomScopeTags({ spaceId: space.id }, ['image']),
    loomStorageUsed(space.id),
  ])
  const initialMeter = loomMeter(loomQuotaFor(space), usage)

  // The shared hero band (LIVE-117, ADR-1261): the '/spaces/_/loom' row, short utility band, rung 1
  // on this Space's own pathname.
  const hero = await resolveIndexHero(`/spaces/${space.slug}/loom`)

  return (
    <IndexTemplate
      {...hero}
      back={{ href: spaceManageHref(space.type, space.slug), label: 'Back to manage' }}
      eyebrow={brandName}
      title="Loom Studio"
      description="Every image in your space's library. Upload new photos, search and filter by tag, and remove what you no longer need. These are the images the Loom picker offers everywhere you edit this space."
    >
      <div className="max-w-5xl">
        <SpaceLoomStudio
          spaceId={space.id}
          initialAssets={initialAssets}
          initialTags={initialTags}
          initialMeter={initialMeter}
        />
      </div>
    </IndexTemplate>
  )
}
