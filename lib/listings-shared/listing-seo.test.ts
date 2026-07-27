import { describe, it, expect } from 'vitest'
import { listingJsonLd, type HousingSeoFacts, type ListingJsonLdInput } from '@/lib/listings-shared/listing-seo'
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

// ── Housing (Accommodation) ───────────────────────────────────────────────────

/** An active housing view with the structured-facts block the detail page attaches. */
function housingView(
  facts: HousingSeoFacts | undefined,
  overrides: Partial<ListingDetailView> = {},
): ListingJsonLdInput {
  return {
    ...marketView({
      vertical: 'housing',
      commentTargetKind: 'listing',
      id: 'house-1',
      title: 'Sunny room in a 3-bed near the park',
      priceLabel: '$1,450/mo',
      priceShort: '$1,450',
      categoryLabel: 'Rental',
      locationLabel: 'North Park, San Diego',
      seller: { handle: 'maya', displayName: 'Maya R.', avatarUrl: null },
      back: { href: '/marketplace/housing', label: 'Housing' },
      ...overrides,
    }),
    housingFacts: facts,
  }
}

const FACTS: HousingSeoFacts = {
  bedrooms: 3,
  bathrooms: 1.5,
  sqft: 850,
  petsAllowed: true,
  amenityLabels: ['In-unit laundry', 'Parking'],
  rentCents: 145000,
}

type AccommodationNode = {
  '@type': string
  numberOfBedrooms?: number
  numberOfBathroomsTotal?: number
  floorSize?: { '@type': string; value: number; unitCode: string }
  petsAllowed?: boolean
  amenityFeature?: { '@type': string; name: string; value: boolean }[]
  address?: { '@type': string; addressLocality?: string; streetAddress?: string }
  offers?: {
    '@type': string
    price?: string
    priceSpecification?: { '@type': string; price: string; priceCurrency: string; unitText: string }
  }
}

function accommodationNode(input: ListingJsonLdInput): AccommodationNode {
  return listingJsonLd(input)[0] as AccommodationNode
}

describe('listingJsonLd — Accommodation (housing facts)', () => {
  it('renders housing as an Accommodation, not a Product', () => {
    expect(accommodationNode(housingView(FACTS))['@type']).toBe('Accommodation')
  })

  it('carries the room, bath, and size facts when present', () => {
    const node = accommodationNode(housingView(FACTS))
    expect(node.numberOfBedrooms).toBe(3)
    expect(node.numberOfBathroomsTotal).toBe(1.5)
    expect(node.floorSize).toEqual({ '@type': 'QuantitativeValue', value: 850, unitCode: 'FTK' })
  })

  it('carries petsAllowed and one LocationFeatureSpecification per amenity label', () => {
    const node = accommodationNode(housingView(FACTS))
    expect(node.petsAllowed).toBe(true)
    expect(node.amenityFeature).toEqual([
      { '@type': 'LocationFeatureSpecification', name: 'In-unit laundry', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Parking', value: true },
    ])
  })

  it('prices the Offer per MONTH via a UnitPriceSpecification from the exact rent_cents', () => {
    const node = accommodationNode(housingView(FACTS))
    expect(node.offers?.priceSpecification).toEqual({
      '@type': 'UnitPriceSpecification',
      price: '1450.00',
      priceCurrency: 'USD',
      unitText: 'MONTH',
    })
    // The flat one-time `price` is a Product concept; housing prices monthly only.
    expect(node.offers?.price).toBeUndefined()
  })

  it('falls back to the parsed price label for the monthly rate when facts carry no rent', () => {
    const node = accommodationNode(housingView({ ...FACTS, rentCents: null }))
    expect(node.offers?.priceSpecification?.price).toBe('1450.00')
    expect(node.offers?.priceSpecification?.unitText).toBe('MONTH')
  })

  it('omits every housing fact key when no facts block is attached (nothing is faked)', () => {
    const node = accommodationNode(housingView(undefined))
    expect(node.numberOfBedrooms).toBeUndefined()
    expect(node.numberOfBathroomsTotal).toBeUndefined()
    expect(node.floorSize).toBeUndefined()
    expect(node.petsAllowed).toBeUndefined()
    expect(node.amenityFeature).toBeUndefined()
  })

  it('omits null facts individually (a partial block emits only what it knows)', () => {
    const node = accommodationNode(
      housingView({ bedrooms: 2, bathrooms: null, sqft: null, petsAllowed: null, amenityLabels: [], rentCents: null }),
    )
    expect(node.numberOfBedrooms).toBe(2)
    expect(node.numberOfBathroomsTotal).toBeUndefined()
    expect(node.floorSize).toBeUndefined()
    expect(node.petsAllowed).toBeUndefined()
    expect(node.amenityFeature).toBeUndefined()
  })

  it('emits petsAllowed: false when the listing explicitly disallows pets', () => {
    expect(accommodationNode(housingView({ ...FACTS, petsAllowed: false })).petsAllowed).toBe(false)
  })

  it('NEVER emits a street address — addressLocality stays the only address field (fair housing/privacy)', () => {
    const node = accommodationNode(housingView(FACTS))
    expect(node.address).toEqual({ '@type': 'PostalAddress', addressLocality: 'North Park, San Diego' })
    expect(JSON.stringify(listingJsonLd(housingView(FACTS)))).not.toContain('streetAddress')
  })

  it('housing facts never leak onto another vertical', () => {
    // Even a (mis-wired) market view carrying a facts block must not emit Accommodation fields.
    const node = listingJsonLd({ ...marketView(), housingFacts: FACTS })[0] as AccommodationNode
    expect(node['@type']).toBe('Product')
    expect(node.numberOfBedrooms).toBeUndefined()
    expect(node.amenityFeature).toBeUndefined()
  })

  it('emits no structured data for a non-active housing listing', () => {
    expect(listingJsonLd(housingView(FACTS, { status: 'closed' }))).toEqual([])
  })
})
