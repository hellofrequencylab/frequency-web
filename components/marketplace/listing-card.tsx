import Image from 'next/image'
import { EntityCard } from '@/components/cards/entity-card'
import type { Listing } from '@/lib/listings/types'

// Browse card for a connect-only listing (General + Housing). Wraps the shared
// EntityCard so the marketplace grid reads like every other browse grid.
export function ListingCard({ listing }: { listing: Listing }) {
  return (
    <EntityCard
      href={`/marketplace/${listing.id}`}
      cover={
        listing.images[0] ? (
          <Image fill src={listing.images[0]} alt="" className="object-cover" sizes="(min-width:1024px) 33vw, 100vw" />
        ) : undefined
      }
      title={listing.title}
      context={[listing.category, listing.city].filter(Boolean).join(' · ') || undefined}
      description={listing.description ?? undefined}
      meta={<span className="font-medium text-text">{listing.priceNote?.trim() || 'Free'}</span>}
    />
  )
}
