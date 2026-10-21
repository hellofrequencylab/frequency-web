import { getListing } from '@/lib/marketplace'
import { listingDetailFromMarket } from '@/lib/listings-shared/detail-view'
import { listingCardResponse } from '@/lib/og/listing-card'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `A listing on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = OG_CONTENT_TYPE

// Share card for /classifieds/<id>. Only an active listing is drawn, the same rule the page applies.
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const listing = await getListing(id).catch(() => null)
  if (!listing || listing.status !== 'active') return listingCardResponse('Classifieds', null)
  const view = listingDetailFromMarket(listing, { isOwner: false })
  return listingCardResponse('Classifieds', {
    title: view.title,
    price: view.priceShort,
    facts: [view.categoryLabel, view.locationLabel],
    blurb: view.description,
    image: view.primaryImage,
  })
}
