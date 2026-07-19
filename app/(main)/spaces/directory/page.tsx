import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, Settings2 } from 'lucide-react'
import { MarketHero } from '@/components/marketplace/market-hero'
import { HERO_PRIMARY_BTN, HERO_SECONDARY_BTN } from '@/components/marketplace/hero-buttons'
import {
  MarketplaceColumnsProvider,
  MarketplaceColumns,
} from '@/components/marketplace/column-selector'
import { PageAdminBar } from '@/components/layout/page-admin-bar'
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
import { resolveHeaderElement } from '@/lib/elements/header'

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
    'Browse the businesses and nonprofits in the Frequency network. See what each one offers, from classes to services to events, then follow or reach out.',
  // The indexable SEO twin is /discover/spaces; this in-app shell page canonicals there (and is kept out
  // of the crawl in robots.ts) so faceted URLs never index as duplicate content.
  alternates: { canonical: '/discover/spaces' },
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

  // The operator-tunable header element (ADR-793): resolves to today's overlay/large/scrim-on look.
  const header = await resolveHeaderElement({ defaults: { layout: 'overlay', height: 'large' } })

  return (
    <div className="space-y-6">
      <MarketHero
        image="/images/site/business-directory-hero.jpg"
        eyebrow="Directory"
        title="Business Spaces"
        subtitle="Find a business or nonprofit near you. See what they offer, from classes to services to events, then follow or reach out."
        variant={header.layout}
        size={header.height}
        overlay={header.scrim}
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

      {/* The on-page operator Settings affordance IndexTemplate used to draw — re-added under the hero
          as its divider rule so nothing an operator had was lost in the move to MarketHero. */}
      <PageAdminBar asDivider />

      {/* Search moved into the hero; the controls that stayed on the page live here, in the polished
          Classifieds grammar: the toolbar (sort + Following + category, with the density chooser
          trailing right) over the grid, both inside the column-density provider that drives `.mp-grid`. */}
      <MarketplaceColumnsProvider className="space-y-5">
        <SpacesToolbar showSearch={false} columns={<MarketplaceColumns />} />

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
            gridClassName="mp-grid gap-6"
          />
        </Suspense>
      </MarketplaceColumnsProvider>
    </div>
  )
}
