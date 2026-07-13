import { resolveListingClaim } from '@/lib/listing-seeder/claim'
import { getListing as getMarketListing, LISTING_KINDS } from '@/lib/marketplace'
import { getListing as getBaseListing } from '@/lib/listings'
import { getHousingDetail, propertyTypeLabel } from '@/lib/listings/housing'
import { claimCardResponse, CLAIM_OG_SIZE } from '@/lib/og/claim-card'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `Claim your listing on ${SITE_NAME}`
export const size = CLAIM_OG_SIZE
export const contentType = 'image/png'

// The share card for a SEEDED LISTING claim link (/listings/claim/<token>), classifieds + housing. A
// marketing pitch aimed at the real poster: the listing's own photo + title, the category pill (the
// classifieds kind or the housing property type), and the Frequency watermark. Only a still-claimable
// token resolves; anything else falls back to a neutral pitch card, so a guessed / used token reveals
// nothing. Marketplace primary accent (#E2912F).

const ACCENT = '#E2912F'

/** First image only when it is an absolute URL (seed inputs carry public library-media URLs). */
function coverUrl(images: string[] | undefined): string | null {
  const first = images?.[0]
  return first && /^https?:\/\//.test(first) ? first : null
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const claim = await resolveListingClaim(token)

  if (!claim) {
    return claimCardResponse({
      name: 'Your listing',
      pill: 'Listing',
      noun: 'listing',
      placeholderRelPath: '/images/site/community-dinner.jpg',
      accent: ACCENT,
    })
  }

  let pill = 'Listing'
  let cover: string | null = null
  if (claim.kind === 'classifieds') {
    const l = await getMarketListing(claim.listingId)
    pill = LISTING_KINDS.find((k) => k.key === l?.kind)?.label ?? 'For sale'
    cover = coverUrl(l?.images)
  } else {
    const [l, detail] = await Promise.all([getBaseListing(claim.listingId), getHousingDetail(claim.listingId)])
    pill = propertyTypeLabel(detail?.propertyType ?? null) ?? 'Housing'
    cover = coverUrl(l?.images)
  }

  return claimCardResponse({
    name: claim.title || 'Your listing',
    pill,
    noun: 'listing',
    coverUrl: cover,
    placeholderRelPath: '/images/site/community-dinner.jpg',
    accent: ACCENT,
  })
}
