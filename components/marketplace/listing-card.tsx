import Image from 'next/image'
import { EntityCard } from '@/components/cards/entity-card'
import type { Listing } from '@/lib/listings/types'

// Browse card for a connect-only listing (Housing). Wraps the shared EntityCard so
// the marketplace grid reads like every other browse grid. `basePath` sets where the
// card links (e.g. /marketplace/housing/<id> for a housing listing's detail page).
export function ListingCard({ listing, basePath = '/marketplace/housing' }: { listing: Listing; basePath?: string }) {
  return (
    <EntityCard
      href={`${basePath}/${listing.id}`}
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
