import { getListingWithOwner } from '@/lib/listings'
import { getHousingDetail } from '@/lib/listings/housing'
import { listingDetailFromHousing } from '@/lib/listings-shared/detail-view'
import { listingCardResponse } from '@/lib/og/listing-card'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `A listing on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = OG_CONTENT_TYPE

// Share card for /housing/<id>. Only an active housing listing is drawn, and the place line is the coarse
// label the page already shows, never the address.
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const listing = await getListingWithOwner(id).catch(() => null)
  if (!listing || listing.vertical !== 'housing' || listing.status !== 'active') {
    return listingCardResponse('Housing', null)
  }
  const detail = await getHousingDetail(id).catch(() => null)
  const view = listingDetailFromHousing(listing, detail, { isOwner: false })
  return listingCardResponse('Housing', {
    title: view.title,
    price: view.priceShort,
    facts: [view.categoryLabel, view.locationLabel],
    blurb: view.description,
    image: view.primaryImage,
  })
}
