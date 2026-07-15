import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, Settings2 } from 'lucide-react'
import { MarketHero } from '@/components/marketplace/market-hero'
import { HERO_PRIMARY_BTN, HERO_SECONDARY_BTN } from '@/components/marketplace/hero-buttons'
import { DirectorySearch } from '@/components/ui/directory-search'
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
// profile (ENTITY-SPACES-BUILD §A/§B). It now opens on the SHARED MarketHero header (the same hero
// band Events / Marketplace Events / Circles use) so every browse surface reads as one header: a
// centered title, the search bar IN the hero, and the action buttons row (Create a Space + Manage
// Spaces). The search moved out of the toolbar into the hero; the toolbar keeps sort + category +
// Following. The grid + pager + "Go Business" sell are the SHARED directory body
// (components/spaces/directory-view), so this in-app surface and the public /discover/spaces surface
// never drift. The grid is its own <Suspense> so the header paints instantly and never blocks on the
// discovery read (PAGE-FRAMEWORK §5). The result set is PAGED (12/24/48), all URL-driven so a filtered
// + paged view stays shareable. Semantic DAWN tokens only, no hex, no em dashes.

export const metadata = {
  title: 'Business Spaces',
  description:
    'Browse every practitioner, business, organization, coaching academy, and event space in the Frequency network. Find one, see what they offer, and connect.',
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

  // The Create + Manage affordances are for signed-in members (each destination re-checks auth). The
  // viewer id also feeds the "Following" filter (a signed-out viewer follows nothing).
  const viewerProfileId = await getMyProfileId()

  // The shared base for every pager/size link — the current filters, so paging preserves them.
  const urlBase = { q, category, following: followingParam, sort: sortParam, per, page }

  return (
    <div className="space-y-6">
      <MarketHero
        image="/images/site/business-directory-hero.jpg"
        eyebrow="Directory"
        title="Business Spaces"
        subtitle="Every practitioner, business, and organization in the Frequency network. Find one, see what they offer, and connect."
        search={<DirectorySearch placeholder="Search Spaces by name" />}
        action={
          viewerProfileId ? (
            <>
              <Link href="/spaces/new" className={HERO_PRIMARY_BTN}>
                <Plus className="h-4 w-4" aria-hidden />
                Create a Space
              </Link>
              <Link href="/spaces/operating" className={HERO_SECONDARY_BTN}>
                <Settings2 className="h-4 w-4" aria-hidden />
                Manage Spaces
              </Link>
            </>
          ) : undefined
        }
      />

      {/* Search now lives in the hero, so the toolbar carries only sort + category + Following. */}
      <SpacesToolbar showSearch={false} />

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
    </div>
  )
}
