import { describe, it, expect } from 'vitest'
import { mediaFromOrder, withImageOrder } from './media-order'
import type { BusinessProfile } from './schema'

describe('mediaFromOrder resolves hero + gallery from an ordered list', () => {
  it('leads with the first image, rest are the gallery', () => {
    expect(mediaFromOrder(['a', 'b', 'c'])).toEqual({ heroPath: 'a', gallery: ['b', 'c'] })
  })

  it('freezes the current hero when locked, gallery is the rest', () => {
    // Order puts 'b' first, but the hero is locked to 'a' → 'a' stays hero, gallery excludes it.
    expect(mediaFromOrder(['b', 'a', 'c'], { lockHero: true, currentHero: 'a' })).toEqual({
      heroPath: 'a',
      gallery: ['b', 'c'],
    })
  })

  it('ignores a lock with no current hero (first leads)', () => {
    expect(mediaFromOrder(['b', 'c'], { lockHero: true, currentHero: null })).toEqual({ heroPath: 'b', gallery: ['c'] })
  })

  it('empty list → no hero, empty gallery', () => {
    expect(mediaFromOrder([])).toEqual({ gallery: [] })
  })
})

describe('withImageOrder writes media onto a copy of the draft', () => {
  const base = (): BusinessProfile => ({ name: 'X', type: 'business', media: { logoPath: 'logo.png', heroPath: 'a' } })

  it('sets hero + gallery, preserves the logo, never mutates input', () => {
    const draft = base()
    const next = withImageOrder(draft, ['p', 'q'])
    expect(next.media).toEqual({ logoPath: 'logo.png', heroPath: 'p', gallery: ['q'] })
    expect(draft.media?.heroPath).toBe('a') // input untouched
  })

  it('keeps the locked hero and reflows the gallery', () => {
    const next = withImageOrder(base(), ['q', 'a', 'p'], { lockHero: true })
    expect(next.media?.heroPath).toBe('a')
    expect(next.media?.gallery).toEqual(['q', 'p'])
  })

  it('clears hero + gallery when the order is empty', () => {
    const next = withImageOrder(base(), [])
    expect(next.media?.heroPath).toBeUndefined()
    expect(next.media?.gallery).toBeUndefined()
    expect(next.media?.logoPath).toBe('logo.png')
  })
})
