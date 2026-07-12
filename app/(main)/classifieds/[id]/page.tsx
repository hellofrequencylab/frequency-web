import { notFound } from 'next/navigation'
import { getMyProfileId, isPlatformStaff } from '@/lib/auth'
import { getListing } from '@/lib/marketplace'
import { ListingOwnerControls } from '@/components/market/listing-owner-controls'
import { ListingDetailTemplate } from '@/components/templates/listing-detail-template'
import { listingDetailFromMarket } from '@/lib/listings-shared/detail-view'
import { getListingComments } from '@/lib/marketplace/listing-comments'

export const dynamic = 'force-dynamic'

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [profileId, isStaff, listing] = await Promise.all([getMyProfileId(), isPlatformStaff(), getListing(id)])
  if (!listing) notFound()

  const isOwner = !!profileId && listing.author_id === profileId
  // Non-active listings are visible only to their author, and to platform staff (so they can moderate).
  if (!isOwner && !isStaff && listing.status !== 'active') notFound()

  const view = listingDetailFromMarket(listing, { isOwner })
  const comments = await getListingComments('market_listing', id)
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
