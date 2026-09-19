import type { Metadata } from 'next'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getListing } from '@/lib/marketplace'
import { ListingDetailTemplate } from '@/components/templates/listing-detail-template'
import { listingDetailFromMarket } from '@/lib/listings-shared/detail-view'
import { listingMetadata } from '@/lib/listings-shared/listing-seo'
import { getListingComments } from '@/lib/marketplace/listing-comments'
import { getHighestOfferCents } from '@/lib/marketplace/listing-offers'
import { approxCoordsForArea } from '@/lib/marketplace/area-geocode'
import { ViewerProvider } from '@/components/layout/viewer-chrome'
import { ViewerListingClaim } from '@/components/marketplace/listing-claim-box'

// Public classified detail, advertised in app/sitemap.ts. Auth during render is a dynamic API
// and would void ISR; the signed-in chrome swaps in from /api/viewer after hydration.
export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing) return { title: 'Listing not found', robots: { index: false, follow: false } }
  return listingMetadata(listingDetailFromMarket(listing, { isOwner: false }))
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing || listing.status !== 'active') notFound()

  const [comments, highestOfferCents] = await Promise.all([
    getListingComments('market_listing', id),
    getHighestOfferCents('market_listing', id),
  ])
  const view = listingDetailFromMarket(listing, { isOwner: false, highestOfferCents })
  // Draw a live AREA map even when the listing has no stored coordinates: geocode its coarse place
  // label (city/neighborhood) to an approximate center. Still area-only (no pin), so the exact pickup
  // spot stays private until the seller reveals it.
  if (view.pickup && view.pickup.lat == null && view.pickup.areaLabel) {
    const coords = await approxCoordsForArea(view.pickup.areaLabel)
    if (coords) view.pickup = { ...view.pickup, lat: coords.lat, lng: coords.lng }
  }
  const firstName = listing.author?.display_name.split(' ')[0] ?? 'the poster'
  const detailPath = `/classifieds/${id}`

  return (
    <ViewerProvider>
      <Suspense fallback={null}>
        <ViewerListingClaim detailPath={detailPath} />
      </Suspense>
      <ListingDetailTemplate
        view={view}
        comments={comments}
        canComment={false}
        canModerate={false}
        myProfileId={null}
        contactNote={
          <p className="text-meta text-subtle">
            No payment happens in the app. Message {firstName} to arrange it offline.
          </p>
        }
      />
    </ViewerProvider>
  )
}
