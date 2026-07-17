import { describe, it, expect } from 'vitest'
import { listingJsonLd } from '@/lib/listings-shared/listing-seo'
import type { ListingDetailView } from '@/lib/listings-shared/detail-view'

// A minimal active Market product view. Only the fields listingJsonLd reads matter; the rest are filled
// with inert defaults so the fixture type-checks against the full ListingDetailView.
function marketView(overrides: Partial<ListingDetailView> = {}): ListingDetailView {
  return {
    vertical: 'market',
    commentTargetKind: 'product',
    id: 'prod-1',
    title: 'Stoneware mug',
    primaryImage: null,
    galleryImages: [],
    priceLabel: '$24',
    priceShort: '$24',
    terms: null,
    categoryLabel: null,
    locationLabel: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    description: null,
    seller: null,
    sellerProfileId: null,
    action: { kind: 'none', label: '', href: '' },
    isOwner: false,
    details: [],
    pickup: null,
    highestOfferCents: null,
    status: null,
    aggregateRating: null,
    back: { href: '/market', label: 'Market' },
    ...overrides,
  }
}

/** The Product node is always the first graph entry (the breadcrumb is second). */
function productNode(view: ListingDetailView) {
  return listingJsonLd(view)[0] as {
    '@type': string
    aggregateRating?: { '@type': string; ratingValue: number; reviewCount: number }
  }
}

describe('listingJsonLd — AggregateRating', () => {
  it('emits an AggregateRating when a product has visible reviews', () => {
    const node = productNode(marketView({ aggregateRating: { ratingValue: 4.8, reviewCount: 12 } }))
    expect(node['@type']).toBe('Product')
    expect(node.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.8,
      reviewCount: 12,
    })
  })

  it('omits the rating node when there are no reviews (never a fake 0)', () => {
    expect(productNode(marketView({ aggregateRating: null })).aggregateRating).toBeUndefined()
  })

  it('omits the rating node when the review count is 0', () => {
    const node = productNode(marketView({ aggregateRating: { ratingValue: 0, reviewCount: 0 } }))
    expect(node.aggregateRating).toBeUndefined()
  })

  it('emits no structured data at all for a non-active listing', () => {
    expect(listingJsonLd(marketView({ status: 'sold_out' }))).toEqual([])
  })
})
