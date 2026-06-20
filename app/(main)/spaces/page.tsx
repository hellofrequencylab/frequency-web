import { Suspense } from 'react'
import Link from 'next/link'
import { Building2, Plus } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { getMyProfileId } from '@/lib/auth'
import { listNetworkedSpaces } from '@/lib/spaces/discovery'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { SpaceCard } from '@/components/spaces/space-card'
import { SpacesToolbar } from '@/components/spaces/spaces-toolbar'

// The Spaces DIRECTORY — the in-app surface where a member browses the networked entity Spaces
// (practitioners, businesses, organizations, coaching academies, event spaces) and opens one's
// profile (ENTITY-SPACES-BUILD §A/§B, Phase 1 / Epic 1.8). Composed, not authored: the Index
// template provides the header grammar, a toolbar carries the search + type filter, and each Space
// renders through the shared SpaceCard -> EntityCard so the directory reads like every other browse
// grid. The grid is its own <Suspense> so the shell + header paint instantly and never block on the
// discovery read (D5 / PAGE-FRAMEWORK §5).

export const metadata = {
  title: 'Spaces',
  description:
    'Browse the practitioners, businesses, organizations, coaching academies, and event spaces in the Frequency network.',
}

// A dimension-matched skeleton grid — same shape/spacing as the real card grid, so the streamed
// grid lands with no layout shift (PAGE-FRAMEWORK §5.4).
function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-40 rounded-2xl" />
      ))}
    </div>
  )
}

async function SpacesGrid({
  type,
  q,
  following,
  viewerProfileId,
}: {
  type?: string
  q?: string
  following: boolean
  viewerProfileId: string | null
}) {
  const spaces = await listNetworkedSpaces({
    type,
    q,
    followerProfileId: viewerProfileId,
    onlyFollowed: following,
  })

  if (spaces.length === 0) {
    const filtering = !!((type ?? '').trim() || (q ?? '').trim() || following)
    const typeLabel = type ? spaceTypeLabel(type) : null
    return (
      <EmptyState
        icon={Building2}
        variant={filtering ? 'no-results' : 'first-use'}
        title={
          following
            ? 'You are not following any Spaces yet.'
            : filtering
              ? 'No Spaces match your search.'
              : 'No Spaces yet.'
        }
        description={
          following
            ? 'Follow a Space from its profile and it shows up here.'
            : filtering
              ? typeLabel
                ? `No ${typeLabel} Spaces matched. Try a different type or a wider search.`
                : 'Try a different type or a wider search.'
              : 'This is where practitioners, businesses, and organizations in the network will live. Check back soon.'
        }
      />
    )
  }

  // The browse grid uses the container-query pattern (each card sizes to the grid, not the viewport)
  // so it stays portable across rail/no-rail widths (PAGE-FRAMEWORK ADR-295).
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
        {spaces.map((space) => (
          <SpaceCard key={space.id} space={space} />
        ))}
      </div>
    </div>
  )
}

export default async function SpacesDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; following?: string }>
}) {
  const { type, q, following: followingParam } = await searchParams
  const following = followingParam === '1'

  // The "Create a space" affordance is for signed-in members (the create action re-checks auth).
  // The viewer id also feeds the "Following" filter (a signed-out viewer follows nothing).
  const viewerProfileId = await getMyProfileId()

  return (
    <IndexTemplate
      title="Spaces"
      description="The practitioners, businesses, and organizations in the Frequency network. Find one, see what they offer, and connect."
      action={
        viewerProfileId ? (
          <Link href="/spaces/new" className={buttonClasses('primary', 'md')}>
            <Plus className="h-4 w-4" aria-hidden />
            Create a space
          </Link>
        ) : undefined
      }
      toolbar={<SpacesToolbar />}
    >
      {/* Keyed on the filters so a new search remounts the boundary and shows the skeleton while the
          next result set streams in. */}
      <Suspense key={`${type ?? ''}:${q ?? ''}:${following ? '1' : ''}`} fallback={<GridSkeleton />}>
        <SpacesGrid type={type} q={q} following={following} viewerProfileId={viewerProfileId} />
      </Suspense>
    </IndexTemplate>
  )
}
