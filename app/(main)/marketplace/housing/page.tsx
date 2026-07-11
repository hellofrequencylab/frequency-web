import Link from 'next/link'
import { Home, Plus, Users, DoorOpen } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { getMyProfileId } from '@/lib/auth'
import { listListings } from '@/lib/listings'
import { ListingCard } from '@/components/marketplace/listing-card'
import { MarketHero } from '@/components/marketplace/market-hero'
import { MarketSearchProvider, MarketSearchBar, InstantGrid } from '@/components/marketplace/market-search'
import { MarketplaceColumnsProvider, MarketplaceColumns } from '@/components/marketplace/column-selector'
import { MarketplaceBar } from '@/components/marketplace/marketplace-bar'
import { MarketplaceGuide } from '@/components/marketplace/marketplace-guide'
import { MarketplaceHiddenBanner } from '@/components/marketplace/hidden-banner'

// Housing — rentals + roommates (connect-only, member-only). Hero-led (the site PhotoHero grammar) to
// match Classifieds / Market / Frequency Store. No em or en dashes.

export const metadata = {
  title: 'Housing',
  description: 'Find a rental or a roommate who actually fits, in your community.',
}

const HERO_IMAGE = 'https://picsum.photos/seed/frequency-housing/1600/600'

export default async function HousingPage() {
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
      <MarketSearchProvider>
        <div className="space-y-8">
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

  // Full list; the hero search bar filters it instantly on the client (no server round-trip).
  const listings = await listListings({ vertical: 'housing' })

  return (
    <MarketSearchProvider>
      <div className="space-y-8">
        {hero}

        <MarketplaceHiddenBanner area="housing" />

        <div className="space-y-6">
          <MarketplaceBar
            active="housing"
            stats={[
              { label: 'Listings', value: listings.length, icon: Home },
              { label: 'Roommates', value: 'Matched', icon: DoorOpen },
            ]}
          />

          {listings.length === 0 ? (
            <EmptyState
              icon={Home}
              variant="first-use"
              title="No housing listed near you yet."
              description="List a room, a rental, or a sublet. Roommate listings will match to members you'd actually get along with."
            />
          ) : (
            <MarketplaceColumnsProvider>
              <div className="mb-4 flex justify-end">
                <MarketplaceColumns />
              </div>
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
            </MarketplaceColumnsProvider>
          )}
        </div>

        <MarketplaceGuide />
      </div>
    </MarketSearchProvider>
  )
}
