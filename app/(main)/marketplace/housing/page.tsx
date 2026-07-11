import Link from 'next/link'
import { Home, Plus, Users, DoorOpen, SlidersHorizontal } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { getMyProfileId } from '@/lib/auth'
import { listHousingListings } from '@/lib/listings/housing'
import { AMENITIES, PROPERTY_TYPES } from '@/lib/listings/types'
import type { AmenitySlug, PropertyType } from '@/lib/listings/types'
import { ListingCard } from '@/components/marketplace/listing-card'
import { MarketHero } from '@/components/marketplace/market-hero'
import { MarketSearchProvider, MarketSearchBar, InstantGrid } from '@/components/marketplace/market-search'
import { MarketplaceColumnsProvider, MarketplaceColumns } from '@/components/marketplace/column-selector'
import { MarketplaceBar } from '@/components/marketplace/marketplace-bar'
import { HousingCategoryNav } from '@/components/marketplace/housing-category-nav'
import { MarketplaceGuide } from '@/components/marketplace/marketplace-guide'
import { MarketplaceHiddenBanner } from '@/components/marketplace/hidden-banner'

// Housing — rentals + roommates (connect-only, member-only). Hero-led (the site PhotoHero grammar) to
// match Classifieds / Market / Frequency Store. The facet band is a plain GET form, so it stays
// URL-driven and shareable without any client JS: the server reads searchParams and narrows the read
// through listHousingListings(facets). No em or en dashes.

export const metadata = {
  title: 'Housing',
  description: 'Find a rental or a roommate who actually fits, in your community.',
}

const HERO_IMAGE = 'https://picsum.photos/seed/frequency-housing/1600/600'

type HousingSearchParams = {
  type?: string
  min?: string
  max?: string
  amenity?: string | string[]
}

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
const FILTER_LABEL = 'mb-1 block text-xs font-medium text-muted'

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

  const hero = (
    <MarketHero
      image={HERO_IMAGE}
      eyebrow="Housing"
      title="Find your place, and your people"
      subtitle="Rentals, sublets, and roommates who actually fit. Listings stay local, and contact is a message away."
      search={<MarketSearchBar placeholder="Search housing" />}
      action={
        viewerProfileId ? (
          <>
            <Link href="/marketplace/housing/roommates" className={buttonClasses('secondary', 'md')}>
              <Users className="h-4 w-4" aria-hidden /> Find a roommate
            </Link>
            <Link href="/marketplace/housing/new" className={buttonClasses('primary', 'md')}>
              <Plus className="h-4 w-4" aria-hidden /> List housing
            </Link>
          </>
        ) : undefined
      }
    />
  )

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
  const selectedType = PROPERTY_TYPES.some((p) => p.slug === sp.type) ? sp.type ?? '' : ''
  const rawAmenities = Array.isArray(sp.amenity) ? sp.amenity : sp.amenity ? [sp.amenity] : []
  const selectedAmenities = new Set(rawAmenities)
  const minCents = dollarsToCents(sp.min)
  const maxCents = dollarsToCents(sp.max)

  // Server-side narrowing through the Phase-2 facets. The hero search bar still filters the
  // returned set instantly on the client (text), so both layers compose.
  const listings = await listHousingListings({
    propertyType: (selectedType || null) as PropertyType | null,
    minPriceCents: minCents,
    maxPriceCents: maxCents,
    amenities: rawAmenities as AmenitySlug[],
  })

  const activeFacetCount =
    (selectedType ? 1 : 0) + (minCents != null || maxCents != null ? 1 : 0) + selectedAmenities.size
  const hasFacets = activeFacetCount > 0

  return (
    <MarketSearchProvider>
      <div className="space-y-6">
        {hero}

        <MarketplaceHiddenBanner area="housing" />

        <div className="space-y-5">
          <MarketplaceBar
            active="housing"
            stats={[
              { label: 'Listings', value: listings.length, icon: Home },
              { label: 'Roommates', value: 'Matched', icon: DoorOpen },
            ]}
          />

          {/* One column-density context spans the sub-menu density control and the grid it drives. */}
          <MarketplaceColumnsProvider className="space-y-6">
            {/* Canonical sub-menu: quick category browse (All | House | Room | Apartment | Studio | Other
                dropdown | Roommates), with the density control folded to the right of the menu. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <HousingCategoryNav selectedType={selectedType} />
              <MarketplaceColumns />
            </div>

            {/* Advanced filters — a URL-driven GET form (no client JS). Submitting rebuilds the query. */}
            <form
              method="get"
              className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-sm"
              aria-label="Filter housing"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <SlidersHorizontal className="h-4 w-4 text-muted" aria-hidden /> Filters
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="type" className={FILTER_LABEL}>
                    Property type
                  </label>
                  <select id="type" name="type" defaultValue={selectedType} className={FIELD}>
                    <option value="">Any type</option>
                    {PROPERTY_TYPES.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="min" className={FILTER_LABEL}>
                    Min rent (per month)
                  </label>
                  <input
                    id="min"
                    name="min"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    defaultValue={sp.min ?? ''}
                    className={FIELD}
                    placeholder="Any"
                  />
                </div>
                <div>
                  <label htmlFor="max" className={FILTER_LABEL}>
                    Max rent (per month)
                  </label>
                  <input
                    id="max"
                    name="max"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    defaultValue={sp.max ?? ''}
                    className={FIELD}
                    placeholder="Any"
                  />
                </div>
              </div>

              <fieldset>
                <legend className={FILTER_LABEL}>Amenities</legend>
                <div className="flex flex-wrap gap-2">
                  {AMENITIES.map((a) => (
                    <label
                      key={a.slug}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary has-[:checked]:border-primary has-[:checked]:bg-primary-bg has-[:checked]:text-primary-strong"
                    >
                      <input
                        type="checkbox"
                        name="amenity"
                        value={a.slug}
                        defaultChecked={selectedAmenities.has(a.slug)}
                        className="sr-only"
                      />
                      {a.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex items-center justify-end gap-2">
                {hasFacets && (
                  <Link href="/marketplace/housing" className={buttonClasses('ghost', 'sm')}>
                    Clear
                  </Link>
                )}
                <button type="submit" className={buttonClasses('primary', 'sm')}>
                  Apply filters
                </button>
              </div>
            </form>

            {listings.length === 0 ? (
              <EmptyState
                icon={Home}
                variant={hasFacets ? 'no-results' : 'first-use'}
                title={hasFacets ? 'Nothing matches those filters.' : 'No housing listed near you yet.'}
                description={
                  hasFacets
                    ? 'Try widening the price range or clearing an amenity.'
                    : 'List a room, a rental, or a sublet. Roommate listings will match to members you\'d actually get along with.'
                }
              />
            ) : (
              <div className="@container">
                <InstantGrid
                  items={listings.map((l) => ({ text: `${l.title} ${l.description ?? ''}` }))}
                  className="mp-grid gap-6"
                >
                  {listings.map((l) => (
                    <ListingCard key={l.id} listing={l} />
                  ))}
                </InstantGrid>
              </div>
            )}
          </MarketplaceColumnsProvider>
        </div>

        <MarketplaceGuide />
      </div>
    </MarketSearchProvider>
  )
}
