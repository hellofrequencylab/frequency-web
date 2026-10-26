import Link from 'next/link'
import { Home, Plus, Users } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { getMyProfileId } from '@/lib/auth'
import { listSavedListingIds, listSavedListings } from '@/lib/listings'
import { listHousingListings } from '@/lib/listings/housing'
import { PROPERTY_TYPES } from '@/lib/listings/types'
import type { AmenitySlug, PropertyType } from '@/lib/listings/types'
import { MarketHero } from '@/components/marketplace/market-hero'
import { MarketSearchProvider, MarketSearchBar } from '@/components/marketplace/market-search'
import { resolveMarketHero } from '@/lib/layout/index-hero'
import { FqHousingBody } from '@/components/frequency/members/marketplace/marketplace-body'

// Housing — rentals + roommates (connect-only, member-only). Hero-led (the site PhotoHero grammar) to
// match Classifieds / Market / Frequency Store. The facet band is a plain GET form, so it stays
// URL-driven and shareable without any client JS: the server reads searchParams and narrows the read
// through listHousingListings(facets). No em or en dashes.

// Same posture as the Frequency Store index (app/(main)/(marketplace)/store/page.tsx:19-23): no /discover twin
// exists for Housing, and this facet-filtered index is not the SEO surface — the individual
// /housing/<id> pages are (self-canonical, Accommodation schema, and the ones app/sitemap.ts
// advertises). So the index is noindexed but still FOLLOWED, letting crawlers walk through to the
// indexable listing pages. It stays out of the robots.ts DISALLOW list for exactly the reason noted
// there: a blanket "/housing" rule would deindex the listing pages too.
export const metadata = {
  title: 'Housing',
  description: 'Find a rental or a roommate who actually fits, in your community.',
  robots: { index: false, follow: true },
}

// A real community photo, not a random stock placeholder. This is the hero and the LCP element, and
// it is what any social or AI preview of the page surfaces, so it has to be ours. This one shows the
// street the community actually lives on, homes and all, which is what the page is about.
const HERO_IMAGE = '/images/site/community-1.jpg'

type HousingSearchParams = {
  type?: string
  min?: string
  max?: string
  amenity?: string | string[]
  /** `?saved=1` narrows the grid to the member's hearted homes. */
  saved?: string
}


// Canonical quick-browse sub-menu: All + one tab per property type, then Roommates (its own route).
// Both these tabs and the advanced filter form drive `?type=`, so the two stay in sync via the URL.
/** A positive integer of dollars from a raw query value, else null. */
function dollarsToCents(v: string | undefined): number | null {
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null
}

export default async function HousingPage({
  searchParams,
}: {
  searchParams: Promise<HousingSearchParams>
}) {
  const viewerProfileId = await getMyProfileId()
  const sp = await searchParams
  // The whole hero band through the ONE browse-hero ladder (lib/layout/index-hero, PROG-P4):
  // the operator's Settings header image, then the page_content hero via the copy cascade, then
  // this page's coded cover, plus the operator-tunable header element (ADR-793) for
  // layout / height / scrim. It used to read the element alone, so an operator who uploaded a
  // header image for this route got nothing.
  const heroBand = await resolveMarketHero('/housing', { cover: HERO_IMAGE })

  const hero = (
    <MarketHero
      {...heroBand}
      eyebrow="Housing"
      title="Find your place, and your people"
      subtitle="Rentals, sublets, and roommates who actually fit. Listings stay local, and contact is a message away."
      search={<MarketSearchBar placeholder="Search housing" />}
      action={
        viewerProfileId ? (
          <>
            <Link href="/housing/roommates" className={buttonClasses('secondary', 'sm')}>
              <Users className="h-4 w-4" aria-hidden /> Find a roommate
            </Link>
            <Link href="/housing/new" className={buttonClasses('primary', 'sm')}>
              <Plus className="h-4 w-4" aria-hidden /> List housing
            </Link>
          </>
        ) : undefined
      }
    />
  )

  if (!viewerProfileId) {
    return (
      <div className="empty stack">
        <span className="h3">Sign in to browse housing</span>
        <span className="t2">
          Housing is for members. It is where you find a place, or a roommate you would click with.
        </span>
        <Link className="btn pa sm" href="/sign-in?next=/housing">
          Sign in
        </Link>
      </div>
    )
  }

  if (!viewerProfileId) {
    return (
      <MarketSearchProvider>
        <div className="space-y-6">
          {hero}
          <EmptyState
            icon={Home}
            variant="permission"
            title="Sign in to browse housing."
            description="Housing is for members. It's where you find a place, or a roommate the resonance engine thinks you'd click with."
          />
        </div>
      </MarketSearchProvider>
    )
  }

  // Facet state, straight from the URL (validated against the controlled vocab in the read helper).
  const savedOnly = sp.saved === '1'
  const selectedType = PROPERTY_TYPES.some((p) => p.slug === sp.type) ? sp.type ?? '' : ''
  const rawAmenities = Array.isArray(sp.amenity) ? sp.amenity : sp.amenity ? [sp.amenity] : []
  const selectedAmenities = new Set(rawAmenities)
  const minCents = dollarsToCents(sp.min)
  const maxCents = dollarsToCents(sp.max)

  // Server-side narrowing through the Phase-2 facets. The hero search bar still filters the
  // returned set instantly on the client (text), so both layers compose. `?saved=1` swaps the
  // read to the member's hearted homes instead (still active listings only).
  const listings = savedOnly
    ? await listSavedListings(viewerProfileId, 'housing')
    : await listHousingListings({
        propertyType: (selectedType || null) as PropertyType | null,
        minPriceCents: minCents,
        maxPriceCents: maxCents,
        amenities: rawAmenities as AmenitySlug[],
      })

  // Which of the visible cards the viewer has hearted — ONE batched read for the grid.
  const savedIds = savedOnly
    ? new Set(listings.map((l) => l.id))
    : await listSavedListingIds(viewerProfileId, listings.map((l) => l.id))

  const activeFacetCount =
    (selectedType ? 1 : 0) + (minCents != null || maxCents != null ? 1 : 0) + selectedAmenities.size
  const hasFacets = activeFacetCount > 0
  return (
    <FqHousingBody
      homes={listings.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        image: l.images[0] ?? null,
        priceNote: l.priceNote,
        category: l.category,
        city: l.city,
        lat: l.latitude,
        lng: l.longitude,
        createdAt: l.createdAt,
        unclaimed: l.seededUnclaimed,
      }))}
      savedIds={[...savedIds]}
      selectedType={selectedType}
      savedOnly={savedOnly}
      min={sp.min ?? ''}
      max={sp.max ?? ''}
      amenities={rawAmenities}
      hasFacets={hasFacets}
    />
  )
}
