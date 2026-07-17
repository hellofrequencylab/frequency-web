import { describe, it, expect } from 'vitest'
import { productSchema, productListSchema, housingListingSchema } from '@/lib/jsonld'

describe('productSchema', () => {
  it('emits a Product with a priced Offer', () => {
    const s = productSchema({ title: 'Stoneware mug', priceCents: 2400, currency: 'usd', path: '/store/mug' }) as {
      '@type': string
      name: string
      offers: { '@type': string; price: string; priceCurrency: string; availability: string }
      url: string
    }
    expect(s['@type']).toBe('Product')
    expect(s.name).toBe('Stoneware mug')
    expect(s.offers.price).toBe('24.00')
    expect(s.offers.priceCurrency).toBe('USD')
    expect(s.offers.availability).toBe('https://schema.org/InStock')
    expect(s.url).toContain('/store/mug')
  })

  it('marks sold-out items', () => {
    const s = productSchema({ title: 'x', priceCents: 100, inStock: false, path: '/store/x' }) as {
      offers: { availability: string }
    }
    expect(s.offers.availability).toBe('https://schema.org/SoldOut')
  })

  it('emits an AggregateRating (1-5 scale) and Review nodes when the product has reviews', () => {
    const s = productSchema({
      title: 'Stoneware mug',
      priceCents: 2400,
      path: '/store/mug',
      aggregateRating: { ratingValue: 4.7, reviewCount: 9 },
      reviews: [
        { author: 'Maya R.', rating: 5, body: 'Beautiful glaze.', datePublished: '2026-02-01T00:00:00.000Z' },
        { author: 'Devon', rating: 4, body: 'Solid everyday mug.', datePublished: '2026-02-02T00:00:00.000Z' },
      ],
    }) as {
      aggregateRating: { '@type': string; ratingValue: number; reviewCount: number; bestRating: number; worstRating: number }
      review: { '@type': string; author: { name: string }; reviewRating: { ratingValue: number }; reviewBody: string }[]
    }
    expect(s.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.7,
      reviewCount: 9,
      bestRating: 5,
      worstRating: 1,
    })
    expect(s.review).toHaveLength(2)
    expect(s.review[0].author.name).toBe('Maya R.')
    expect(s.review[0].reviewBody).toBe('Beautiful glaze.')
  })

  it('omits rating + review nodes for an unreviewed product (never a fake 0)', () => {
    const s = productSchema({ title: 'x', priceCents: 100, path: '/store/x', aggregateRating: null, reviews: [] })
    expect(s).not.toHaveProperty('aggregateRating')
    expect(s).not.toHaveProperty('review')
  })

  it('omits the AggregateRating when reviewCount is 0', () => {
    const s = productSchema({
      title: 'x',
      priceCents: 100,
      path: '/store/x',
      aggregateRating: { ratingValue: 0, reviewCount: 0 },
    })
    expect(s).not.toHaveProperty('aggregateRating')
  })
})

describe('productListSchema', () => {
  it('emits an ItemList with positions', () => {
    const s = productListSchema([{ title: 'a', path: '/p/a' }, { title: 'b', path: '/p/b' }], 'Market') as {
      '@type': string
      numberOfItems: number
      itemListElement: { position: number }[]
    }
    expect(s['@type']).toBe('ItemList')
    expect(s.numberOfItems).toBe(2)
    expect(s.itemListElement[1].position).toBe(2)
  })
})

describe('housingListingSchema', () => {
  it('emits an Accommodation with city-level address and monthly rent', () => {
    const s = housingListingSchema({
      title: 'Sunny room',
      city: 'Encinitas',
      rentCents: 120000,
      bedrooms: 1,
      roomType: 'private_room',
      path: '/marketplace/housing/abc',
    }) as {
      '@type': string
      address: { addressLocality: string; streetAddress?: string }
      numberOfBedrooms: number
      offers: { priceSpecification: { unitCode: string; price: string } }
    }
    expect(s['@type']).toBe('Room')
    expect(s.address.addressLocality).toBe('Encinitas')
    expect(s.address.streetAddress).toBeUndefined()
    expect(s.numberOfBedrooms).toBe(1)
    expect(s.offers.priceSpecification.unitCode).toBe('MON')
    expect(s.offers.priceSpecification.price).toBe('1200.00')
  })

  it('redacts location when no city is known', () => {
    const s = housingListingSchema({ title: 'x', path: '/marketplace/housing/x' }) as {
      address: { addressLocality: string }
    }
    expect(s.address.addressLocality).toBe('Shared with members')
  })
})
