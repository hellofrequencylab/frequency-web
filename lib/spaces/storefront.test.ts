import { describe, it, expect } from 'vitest'
import { readStorefrontConfig, withStorefrontConfig, STOREFRONT_DEFAULT } from './storefront'

describe('readStorefrontConfig', () => {
  it('returns defaults for a missing / malformed storefront node', () => {
    expect(readStorefrontConfig(undefined)).toEqual(STOREFRONT_DEFAULT)
    expect(readStorefrontConfig({})).toEqual(STOREFRONT_DEFAULT)
    expect(readStorefrontConfig({ storefront: 'nope' })).toEqual(STOREFRONT_DEFAULT)
  })

  it('reads a full valid node', () => {
    const cfg = readStorefrontConfig({
      storefront: { tabLabel: 'Store', published: true, bannerUrl: 'https://cdn.example.com/b.jpg', bannerFocus: '20% 80%' },
    })
    expect(cfg).toEqual({ tabLabel: 'Store', published: true, bannerUrl: 'https://cdn.example.com/b.jpg', bannerFocus: '20% 80%' })
  })

  it('rejects a non-http banner URL and a malformed focus', () => {
    const cfg = readStorefrontConfig({
      storefront: { tabLabel: 'Shop', published: false, bannerUrl: 'javascript:alert(1)', bannerFocus: 'garbage' },
    })
    expect(cfg.bannerUrl).toBeNull()
    expect(cfg.bannerFocus).toBe('50% 50%')
  })
})

describe('withStorefrontConfig', () => {
  it('merges a banner patch and re-sanitizes, leaving the input untouched', () => {
    const prefs = { other: 1, storefront: { tabLabel: 'Shop', published: true } }
    const next = withStorefrontConfig(prefs, { bannerUrl: 'https://cdn.example.com/x.png', bannerFocus: '10% 10%' })
    expect((next.storefront as Record<string, unknown>).bannerUrl).toBe('https://cdn.example.com/x.png')
    expect((next.storefront as Record<string, unknown>).bannerFocus).toBe('10% 10%')
    expect((next.storefront as Record<string, unknown>).published).toBe(true) // preserved
    expect(next.other).toBe(1) // sibling prefs preserved
    // input object not mutated
    expect((prefs.storefront as Record<string, unknown>).bannerUrl).toBeUndefined()
  })

  it('clears the banner when passed null', () => {
    const next = withStorefrontConfig(
      { storefront: { tabLabel: 'Shop', published: true, bannerUrl: 'https://cdn.example.com/x.png' } },
      { bannerUrl: null },
    )
    expect((next.storefront as Record<string, unknown>).bannerUrl).toBeNull()
  })
})
