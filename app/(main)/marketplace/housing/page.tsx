import Link from 'next/link'
import { Home, Plus, Users, DoorOpen } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { getMyProfileId } from '@/lib/auth'
import { listListings } from '@/lib/listings'
import { ListingCard } from '@/components/marketplace/listing-card'
import { MarketHero } from '@/components/marketplace/market-hero'
import { MarketSearchBar } from '@/components/marketplace/market-search-bar'
import { MarketplaceFacets } from '@/components/marketplace/facet-nav'
import { MarketplaceHiddenBanner } from '@/components/marketplace/hidden-banner'

// Housing — rentals + roommates (connect-only, member-only). Hero-led (the site PhotoHero grammar) to
// match Classifieds / Market / Frequency Store. No em or en dashes.

export const metadata = {
  title: 'Housing',
  description: 'Find a rental or a roommate who actually fits, in your community.',
}

const HERO_IMAGE = 'https://picsum.photos/seed/frequency-housing/1600/600'

export default async function HousingPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const query = (q ?? '').trim().toLowerCase()
  const viewerProfileId = await getMyProfileId()

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
      <div className="space-y-8">
        {hero}
        <EmptyState
          icon={Home}
          variant="permission"
          title="Sign in to browse housing."
          description="Housing is for members. It's where you find a place, or a roommate the resonance engine thinks you'd click with."
        />
      </div>
    )
  }

  const allListings = await listListings({ vertical: 'housing' })
  const listings = query
    ? allListings.filter((l) => `${l.title} ${l.description ?? ''}`.toLowerCase().includes(query))
    : allListings

  return (
    <div className="space-y-8">
      {hero}

      <MarketplaceHiddenBanner area="housing" />

      <div className="space-y-6">
        <MarketplaceFacets active="housing" />

        <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
          <StatCard size="sm" label="Listings" value={allListings.length} icon={Home} />
          <StatCard size="sm" label="Roommates" value="Matched" icon={DoorOpen} />
        </div>

        {listings.length === 0 ? (
          <EmptyState
            icon={Home}
            variant="first-use"
            title="No housing listed near you yet."
            description="List a room, a rental, or a sublet. Roommate listings will match to members you'd actually get along with."
          />
        ) : (
          <div className="@container">
            <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
              {listings.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
