import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceManageHref } from '@/lib/spaces/types'
import { listLoomScopeImages, listLoomScopeTags } from '@/lib/library/store'
import { IndexTemplate } from '@/components/templates'
import { SpaceLoomStudio } from '@/components/spaces/loom/space-loom-studio'

// THE SPACE LOOM STUDIO page (SPACE_MODULES `space.loom`): the full-page image-library manager for one Space.
// The counterpart to the popup LoomPicker — browse, upload, organize, and delete the Space's own images.
// Owner-gated (canEditProfile = owner/admin/editor), exactly like the Practices manager: a regular member
// never reaches this surface (the /manage console gates it), so business operators get the Studio while
// members only ever get the popup picker. Fail closed on a missing/not-visible space (no existence leak).

export const metadata: Metadata = { title: 'Loom Studio' }
export const dynamic = 'force-dynamic'

export default async function SpaceLoomStudioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) notFound()

  const brandName = space.brandName ?? space.name
  const [initialAssets, initialTags] = await Promise.all([
    listLoomScopeImages({ spaceId: space.id }, { kinds: ['image'] }),
    listLoomScopeTags({ spaceId: space.id }, ['image']),
  ])

  return (
    <IndexTemplate
      back={{ href: spaceManageHref(space.type, space.slug), label: 'Back to manage' }}
      eyebrow={brandName}
      title="Loom Studio"
      description="Every image in your space's library. Upload new photos, search and filter by tag, and remove what you no longer need. These are the images the Loom picker offers everywhere you edit this space."
    >
      <div className="max-w-5xl">
        <SpaceLoomStudio spaceId={space.id} initialAssets={initialAssets} initialTags={initialTags} />
      </div>
    </IndexTemplate>
  )
}
