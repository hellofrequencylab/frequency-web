import { describe, expect, it } from 'vitest'
import {
  NO_MARKET_FACETS,
  categoryFacetValues,
  hasMarketFacets,
  itemMatchesMarketFacets,
  marketHref,
  parseMarketFacets,
  priceBandBounds,
  sellerOwnerKind,
} from './market-facets'

describe('parseMarketFacets', () => {
  it('keeps known values and drops everything else', () => {
    expect(parseMarketFacets({ category: 'Handmade', price: '25-50', condition: 'used', seller: 'maker' })).toEqual({
      category: 'Handmade',
      price: '25-50',
      condition: 'used',
      seller: 'maker',
    })
    expect(parseMarketFacets({ category: "x' or 1=1", price: 'cheap', condition: 'mint', seller: 'robot' })).toEqual(NO_MARKET_FACETS)
    expect(parseMarketFacets({})).toEqual(NO_MARKET_FACETS)
  })

  it('reads the first of a repeated param and ignores blanks from an untouched select', () => {
    expect(parseMarketFacets({ price: ['free', 'under-25'], category: '' }).price).toBe('free')
    expect(hasMarketFacets(parseMarketFacets({ category: '', price: '', condition: '', seller: '' }))).toBe(false)
  })
})

describe('categoryFacetValues', () => {
  it('widens a top-level group to its subcategories and keeps a subcategory alone', () => {
    expect(categoryFacetValues('Handmade')).toContain('Jewelry')
    expect(categoryFacetValues('Handmade')[0]).toBe('Handmade')
    expect(categoryFacetValues('Jewelry')).toEqual(['Jewelry'])
    expect(categoryFacetValues('Nope')).toEqual([])
    expect(categoryFacetValues(null)).toEqual([])
  })
})

describe('bounds', () => {
  it('maps price bands to cents and seller types to owner kinds', () => {
    expect(priceBandBounds('free')).toEqual({ min: 0, max: 1 })
    expect(priceBandBounds('100-plus')).toEqual({ min: 10000, max: null })
    expect(priceBandBounds(null)).toBeNull()
    expect(sellerOwnerKind('business')).toBe('space')
    expect(sellerOwnerKind(null)).toBeNull()
  })
})

describe('itemMatchesMarketFacets', () => {
  const item = { category: 'Jewelry', priceCents: 2500, condition: 'new' as const, ownerKind: 'profile' }
  it('applies every facet the way the query does', () => {
    expect(itemMatchesMarketFacets(item, NO_MARKET_FACETS)).toBe(true)
    expect(itemMatchesMarketFacets(item, { ...NO_MARKET_FACETS, category: 'Handmade' })).toBe(true)
    expect(itemMatchesMarketFacets(item, { ...NO_MARKET_FACETS, category: 'Wellness' })).toBe(false)
    expect(itemMatchesMarketFacets(item, { ...NO_MARKET_FACETS, price: '25-50' })).toBe(true)
    expect(itemMatchesMarketFacets(item, { ...NO_MARKET_FACETS, price: 'under-25' })).toBe(false)
    expect(itemMatchesMarketFacets(item, { ...NO_MARKET_FACETS, condition: 'used' })).toBe(false)
    expect(itemMatchesMarketFacets(item, { ...NO_MARKET_FACETS, seller: 'business' })).toBe(false)
  })
  it('reads a projection with no price as free', () => {
    const free = { category: 'A Space', priceCents: null, condition: null, ownerKind: 'space' }
    expect(itemMatchesMarketFacets(free, { ...NO_MARKET_FACETS, price: 'free' })).toBe(true)
    expect(itemMatchesMarketFacets(free, { ...NO_MARKET_FACETS, condition: 'new' })).toBe(false)
  })
})

describe('marketHref', () => {
  it('leaves the unfiltered links exactly as they were', () => {
    expect(marketHref(null)).toBe('/market')
    expect(marketHref('services')).toBe('/market?group=services')
  })
  it('carries the facets in a stable order', () => {
    expect(marketHref('products', { category: 'Art & Prints', price: 'free', condition: null, seller: 'maker' })).toBe(
      '/market?group=products&category=Art+%26+Prints&price=free&seller=maker',
    )
  })
})
