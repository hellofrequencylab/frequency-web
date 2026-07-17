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
    reviews: [],
    back: { href: '/market', label: 'Market' },
    ...overrides,
  }
}

type ReviewNode = {
  '@type': string
  author: { '@type': string; name: string }
  reviewRating: { '@type': string; ratingValue: number; bestRating: number; worstRating: number }
  reviewBody: string
  datePublished?: string
}

/** The Product node is always the first graph entry (the breadcrumb is second). */
function productNode(view: ListingDetailView) {
  return listingJsonLd(view)[0] as {
    '@type': string
    aggregateRating?: { '@type': string; ratingValue: number; reviewCount: number; bestRating: number; worstRating: number }
    review?: ReviewNode[]
  }
}

const review = (over: Partial<ListingDetailView['reviews'][number]> = {}): ListingDetailView['reviews'][number] => ({
  author: 'Maya R.',
  rating: 5,
  body: 'The glaze is gorgeous and it holds heat well.',
  datePublished: '2026-02-01T00:00:00.000Z',
  ...over,
})

describe('listingJsonLd — AggregateRating', () => {
  it('emits an AggregateRating (with the 1-5 scale) when a product has visible reviews', () => {
    const node = productNode(marketView({ aggregateRating: { ratingValue: 4.8, reviewCount: 12 } }))
    expect(node['@type']).toBe('Product')
    expect(node.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.8,
      reviewCount: 12,
      bestRating: 5,
      worstRating: 1,
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

describe('listingJsonLd — Review nodes', () => {
  it('emits schema.org Review nodes when the listing carries reviews', () => {
    const node = productNode(
      marketView({
        reviews: [
          review({ author: 'Maya R.', rating: 5, body: 'Beautiful mug.', datePublished: '2026-02-01T00:00:00.000Z' }),
          review({ author: 'Devon', rating: 4, body: 'Solid, a little smaller than expected.' }),
        ],
      }),
    )
    expect(node.review).toHaveLength(2)
    const [first] = node.review!
    expect(first).toEqual({
      '@type': 'Review',
      author: { '@type': 'Person', name: 'Maya R.' },
      reviewRating: { '@type': 'Rating', ratingValue: 5, bestRating: 5, worstRating: 1 },
      reviewBody: 'Beautiful mug.',
      datePublished: '2026-02-01T00:00:00.000Z',
    })
  })

  it('omits the review property entirely when there are no reviews', () => {
    expect(productNode(marketView({ reviews: [] })).review).toBeUndefined()
  })

  it('drops reviews with an empty body or a missing author (never a placeholder node)', () => {
    const node = productNode(
      marketView({
        reviews: [
          review({ author: 'Real Person', body: 'Genuinely great.' }),
          review({ author: '   ', body: 'no author' }),
          review({ author: 'No Body', body: '   ' }),
        ],
      }),
    )
    expect(node.review).toHaveLength(1)
    expect(node.review![0].author.name).toBe('Real Person')
  })

  it('clamps an out-of-range rating into the 1-5 scale', () => {
    const node = productNode(marketView({ reviews: [review({ rating: 9, body: 'over the top' })] }))
    expect(node.review![0].reviewRating.ratingValue).toBe(5)
  })

  it('caps the number of Review nodes so the JSON-LD stays lean', () => {
    const many = Array.from({ length: 20 }, (_, i) => review({ author: `R${i}`, body: `Review ${i}` }))
    const node = productNode(marketView({ reviews: many }))
    expect(node.review!.length).toBeLessThanOrEqual(10)
  })

  it('omits Review nodes for a non-active listing (no rich result at all)', () => {
    expect(listingJsonLd(marketView({ status: 'sold_out', reviews: [review()] }))).toEqual([])
  })
})
