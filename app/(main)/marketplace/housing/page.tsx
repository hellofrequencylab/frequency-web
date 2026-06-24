import { Suspense } from 'react'
import Link from 'next/link'
import { Home, Plus } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { getMyProfileId } from '@/lib/auth'
import { listListings } from '@/lib/listings'
import { ListingCard } from '@/components/marketplace/listing-card'

// Housing — rentals + roommates (connect-only). Member-only surface (high-trust).
// Resonance-based roommate matching + geo browse arrive with the housing detail
// pages in the follow-up; this is the browse + post entry.

export const metadata = {
  title: 'Housing',
  description: 'Find a rental or a roommate who actually fits, in your community.',
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-44 rounded-2xl" />
      ))}
    </div>
  )
}

async function HousingGrid() {
  const listings = await listListings({ vertical: 'housing' })
  if (listings.length === 0) {
    return (
      <EmptyState
        icon={Home}
        variant="first-use"
        title="No housing listed near you yet."
        description="List a room, a rental, or a sublet. Roommate listings will match to members you'd actually get along with."
      />
    )
  }
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
        {listings.map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </div>
    </div>
  )
}

export default async function HousingPage() {
  const viewerProfileId = await getMyProfileId()
  if (!viewerProfileId) {
    return (
      <IndexTemplate title="Housing" description="Rentals and roommates, matched to your community.">
        <EmptyState
          icon={Home}
          variant="permission"
          title="Sign in to browse housing."
          description="Housing is for members. It's where you find a place, or a roommate the resonance engine thinks you'd click with."
        />
      </IndexTemplate>
    )
  }
  return (
    <IndexTemplate
      title="Housing"
      description="Find a place, or a roommate who actually fits. Listings stay local, and contact is a message away."
      action={
        <Link href="/marketplace/housing/new" className={buttonClasses('primary', 'md')}>
          <Plus className="h-4 w-4" aria-hidden />
          List housing
        </Link>
      }
    >
      <Suspense fallback={<GridSkeleton />}>
        <HousingGrid />
      </Suspense>
    </IndexTemplate>
  )
}
