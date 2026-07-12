import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getMyProfileId, isPlatformStaff } from '@/lib/auth'
import { getListing, getListingClaimToken } from '@/lib/marketplace'
import { resolveListingClaim } from '@/lib/listing-seeder/claim'
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

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ claim?: string; claimed?: string }>
}) {
  const { id } = await params
  const { claim: claimParam } = await searchParams
  const [profileId, isStaff, listing] = await Promise.all([getMyProfileId(), isPlatformStaff(), getListing(id)])
  if (!listing) notFound()

  const isOwner = !!profileId && listing.author_id === profileId
  // Non-active listings are visible only to their author, and to platform staff (so they can moderate).
  if (!isOwner && !isStaff && listing.status !== 'active') notFound()

  // Claim link: a visitor arriving with ?claim=<token> that resolves to THIS still-unclaimed listing
  // sees a "Claim listing" box instead of Contact the seller. resolveListingClaim returns null for a
  // used/unknown token or an already-claimed row, so the token self-validates and reveals nothing.
  let claimToken: string | null = null
  if (claimParam) {
    const resolved = await resolveListingClaim(claimParam)
    if (resolved && resolved.listingId === id) claimToken = claimParam
  }

  // Operator (admin/janitor) shortcut: for a SEEDED, still-unclaimed listing, surface the shareable
  // claim link in the Manage box so they can send it to the real poster. Disappears once claimed.
  let claimShareUrl: string | undefined
  if (isStaff && listing.seededUnclaimed) {
    const token = await getListingClaimToken(id)
    if (token) claimShareUrl = `/classifieds/${id}?claim=${token}`
  }

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
      claimToken={claimToken}
      ownerControls={
        isOwner || isStaff ? (
          <ListingOwnerControls id={listing.id} status={listing.status} claimShareUrl={claimShareUrl} />
        ) : undefined
      }
    />
  )
}
