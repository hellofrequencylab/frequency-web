import { describe, expect, it } from 'vitest'
import { columnImageFromPick, columnImagePatch, columnImageUrl } from './column-image'

const ID = 'a1b2c3d4-1111-4222-8333-444455556666'

describe('columnImageFromPick', () => {
  it('stores both halves when the Loom hands an id', () => {
    expect(columnImageFromPick({ url: 'https://cdn.test/a.jpg', assetId: ID })).toEqual({
      url: 'https://cdn.test/a.jpg',
      assetId: ID,
    })
  })

  it('keeps a house icon as url-only (no catalog row)', () => {
    expect(columnImageFromPick({ url: 'https://cdn.test/icons/star.svg' })).toEqual({
      url: 'https://cdn.test/icons/star.svg',
      assetId: null,
    })
  })

  it('clears both halves on remove', () => {
    expect(columnImageFromPick(null)).toEqual({ url: null, assetId: null })
  })
})

describe('columnImageUrl — readers prefer the live asset', () => {
  it('uses the live url when the id resolves', () => {
    const live = new Map([[ID, 'https://cdn.test/new.jpg']])
    expect(columnImageUrl('https://cdn.test/old.jpg', ID, live)).toBe('https://cdn.test/new.jpg')
  })

  it('fails open to the cache when the asset is missing', () => {
    expect(columnImageUrl('https://cdn.test/old.jpg', ID, new Map())).toBe('https://cdn.test/old.jpg')
  })

  it('paints a legacy url with no id', () => {
    expect(columnImageUrl('https://cdn.test/old.jpg', null, new Map())).toBe('https://cdn.test/old.jpg')
  })
})

describe('columnImagePatch', () => {
  it('writes both columns, and a url-only pick nulls the companion', () => {
    expect(columnImagePatch('brand_logo_url', 'brand_logo_asset_id', {
      url: 'https://cdn.test/a.jpg',
      assetId: null,
    })).toEqual({
      brand_logo_url: 'https://cdn.test/a.jpg',
      brand_logo_asset_id: null,
    })
  })
})
