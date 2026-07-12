import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { getMyProfileId } from '@/lib/auth'
import { normalizeSpaceSort } from '@/lib/spaces/discovery'
import { SpacesToolbar } from '@/components/spaces/spaces-toolbar'
import {
  SpacesGrid,
  GridSkeleton,
  normalizePerPage,
  normalizePage,
} from '@/components/spaces/directory-view'

// The Spaces DIRECTORY — the in-app surface where a member browses the networked entity Spaces
// (practitioners, businesses, organizations, coaching academies, event spaces) and opens one's
// profile (ENTITY-SPACES-BUILD §A/§B, Phase 1 / Epic 1.8). Composed, not authored: the Index
// template provides the header grammar, a toolbar carries the search + category filter, and the
// grid + pager + "Go Business" sell are the SHARED directory body (components/spaces/directory-view),
// so this in-app surface and the public /discover/spaces surface never drift. The grid is its own
// <Suspense> so the shell + header paint instantly and never block on the discovery read (D5 /
// PAGE-FRAMEWORK §5). The result set is PAGED (12/24/48 per page), all URL-driven so a filtered +
// paged view stays shareable.

export const metadata = {
  title: 'Business Spaces',
  description:
    'Browse every practitioner, business, organization, coaching academy, and event space in the Frequency network.',
}

const DIRECTORY_BASE = '/spaces/directory'

export default async function SpacesDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    category?: string
    following?: string
    sort?: string
    per?: string
    page?: string
  }>
}) {
  const {
    q,
    category,
    following: followingParam,
    sort: sortParam,
    per: perParam,
    page: pageParam,
  } = await searchParams
  const following = followingParam === '1'
  const sort = normalizeSpaceSort(sortParam)
  const per = normalizePerPage(perParam)
  const page = normalizePage(pageParam)

  // The "Create a space" affordance is for signed-in members (the create action re-checks auth).
  // The viewer id also feeds the "Following" filter (a signed-out viewer follows nothing).
  const viewerProfileId = await getMyProfileId()

  // The shared base for every pager/size link — the current filters, so paging preserves them.
  const urlBase = { q, category, following: followingParam, sort: sortParam, per, page }

  return (
    <IndexTemplate
      title="Business Spaces"
      description="Every practitioner, business, and organization in the Frequency network. Find one, see what they offer, and connect."
      // The directory opens on a HERO band (the Space-profile hero grammar): the site photo with
      // the title, subtitle, and Create action overlaid on the ink scrim. Swap the image by
      // replacing public/images/site/business-directory-hero.jpg — no code change.
      heroImage="/images/site/business-directory-hero.jpg"
      heroOverlay
      // The one deliberately LARGER hero on the site: the directory keeps its taller band + bigger
      // title while every other index shares the standard overlay size.
      heroSize="large"
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
      {/* Keyed on the filters + sort + page window so a new query remounts the boundary and shows the
          skeleton while the next result set streams in. */}
      <Suspense
        key={`${q ?? ''}:${category ?? ''}:${following ? '1' : ''}:${sort}:${per}:${page}`}
        fallback={<GridSkeleton />}
      >
        <SpacesGrid
          basePath={DIRECTORY_BASE}
          q={q}
          category={category}
          following={following}
          sort={sort}
          page={page}
          per={per}
          viewerProfileId={viewerProfileId}
          urlBase={urlBase}
        />
      </Suspense>
    </IndexTemplate>
  )
}
