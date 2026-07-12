import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getMyProfileId, isPlatformStaff } from '@/lib/auth'
import { getListing } from '@/lib/marketplace'
import { ListingOwnerControls } from '@/components/market/listing-owner-controls'
import { ListingDetailTemplate } from '@/components/templates/listing-detail-template'
import { listingDetailFromMarket } from '@/lib/listings-shared/detail-view'
import { listingMetadata } from '@/lib/listings-shared/listing-seo'
import { getListingComments } from '@/lib/marketplace/listing-comments'
import { getHighestOfferCents } from '@/lib/marketplace/listing-offers'
import { approxCoordsForArea } from '@/lib/marketplace/area-geocode'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing) return { title: 'Listing not found', robots: { index: false, follow: false } }
  return listingMetadata(listingDetailFromMarket(listing, { isOwner: false }))
}

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [profileId, isStaff, listing] = await Promise.all([getMyProfileId(), isPlatformStaff(), getListing(id)])
  if (!listing) notFound()

  const isOwner = !!profileId && listing.author_id === profileId
  // Non-active listings are visible only to their author, and to platform staff (so they can moderate).
  if (!isOwner && !isStaff && listing.status !== 'active') notFound()

  const [comments, highestOfferCents] = await Promise.all([
    getListingComments('market_listing', id),
    getHighestOfferCents('market_listing', id),
  ])
  const view = listingDetailFromMarket(listing, { isOwner, highestOfferCents })
  // Draw a live AREA map even when the listing has no stored coordinates: geocode its coarse place
  // label (city/neighborhood) to an approximate center. Still area-only (no pin), so the exact pickup
  // spot stays private until the seller reveals it.
  if (view.pickup && view.pickup.lat == null && view.pickup.areaLabel) {
    const coords = await approxCoordsForArea(view.pickup.areaLabel)
    if (coords) view.pickup = { ...view.pickup, lat: coords.lat, lng: coords.lng }
  }
  const firstName = listing.author?.display_name.split(' ')[0] ?? 'the poster'

  return (
    <ListingDetailTemplate
      view={view}
      comments={comments}
      canComment={!!profileId}
      canModerate={isOwner || isStaff}
      myProfileId={profileId}
      contactNote={
        !isOwner ? (
          <p className="text-xs text-subtle">
            No payment happens in the app. Message {firstName} to arrange it offline.
          </p>
        ) : undefined
      }
      ownerControls={
        isOwner || isStaff ? <ListingOwnerControls id={listing.id} status={listing.status} /> : undefined
      }
    />
  )
}
