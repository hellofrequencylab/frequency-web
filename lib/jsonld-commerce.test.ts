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
