import { describe, expect, it } from 'vitest'
import type { NetworkedSpace } from './discovery'
import { buildDirectorySections, isFiltering, showLimit } from './directory-sections'

function space(over: Partial<NetworkedSpace> & { id: string }): NetworkedSpace {
  return {
    slug: over.id,
    name: over.id,
    type: 'business',
    kind: 'business',
    kindLabel: 'Business',
    tagline: null,
    logoUrl: null,
    logoBackdrop: 'plate',
    coverUrl: null,
    city: null,
    action: null,
    updatedAt: null,
    memberCount: null,
    followerCount: null,
    upcomingEventCount: null,
    isFoundingBusiness: false,
    standing: 0,
    boosted: false,
    directoryFeatured: false,
    ...over,
  } as NetworkedSpace
}

const A = space({ id: 'a', standing: 0.9, city: 'Encinitas', kind: 'studio', upcomingEventCount: 2 })
const B = space({ id: 'b', standing: 0.5, city: 'Encinitas', isFoundingBusiness: true })
const C = space({ id: 'c', standing: 0.7, city: 'Vista', directoryFeatured: true })
const D = space({ id: 'd', standing: 0.1, isFoundingBusiness: true })
const ALL = [A, B, C, D]

describe('buildDirectorySections', () => {
  it('leads with the operator picks, then says they are picked', () => {
    const s = buildDirectorySections(ALL, ALL, {})
    expect(s.featured.map((x) => x.id)).toEqual(['c'])
    expect(s.featuredPicked).toBe(true)
  })

  it('falls back to the most active three when nothing is picked', () => {
    const none = ALL.map((x) => ({ ...x, directoryFeatured: false }))
    const s = buildDirectorySections(none, none, {})
    expect(s.featured.map((x) => x.id)).toEqual(['a', 'c', 'b'])
    expect(s.featuredPicked).toBe(false)
  })

  it('does not repeat the lead rows in the results', () => {
    const s = buildDirectorySections(ALL, ALL, {})
    const lead = new Set([...s.featured, ...s.founding].map((x) => x.id))
    expect(s.results.some((x) => lead.has(x.id))).toBe(false)
    expect(s.total).toBe(ALL.length - lead.size)
  })

  it('keeps a featured Space out of the Founding row and lists the rest', () => {
    const picked = ALL.map((x) => (x.id === 'b' ? { ...x, directoryFeatured: true } : x))
    const s = buildDirectorySections(picked, picked, {})
    expect(s.founding.map((x) => x.id)).toEqual(['d'])
  })

  it('drops the lead rows while filtering', () => {
    const s = buildDirectorySections(ALL, [A], { q: 'a' })
    expect(s.filtering).toBe(true)
    expect(s.featured).toEqual([])
    expect(s.founding).toEqual([])
    expect(s.results.map((x) => x.id)).toEqual(['a'])
  })

  it('narrows by city and by has-events', () => {
    expect(buildDirectorySections(ALL, ALL, { city: 'encinitas' }).total).toBe(2)
    expect(buildDirectorySections(ALL, ALL, { events: '1' }).results.map((x) => x.id)).toEqual(['a'])
  })

  it('tallies kinds and cities from the whole directory', () => {
    const s = buildDirectorySections(ALL, [A], { q: 'a' })
    expect(s.kindCounts).toEqual([
      { key: 'business', label: 'Business', n: 3 },
      { key: 'studio', label: 'Studios', n: 1 },
    ])
    expect(s.cities[0]).toEqual({ value: 'encinitas', label: 'Encinitas', n: 2 })
  })

  it('windows the grid and offers more', () => {
    const many = Array.from({ length: 30 }, (_, i) => space({ id: `s${i}` }))
    const s = buildDirectorySections(many, many, {})
    expect(s.results).toHaveLength(12)
    expect(s.hasMore).toBe(true)
    expect(buildDirectorySections(many, many, { show: '24' }).results).toHaveLength(24)
  })
})

describe('showLimit and isFiltering', () => {
  it('clamps the window to whole steps within the cap', () => {
    expect(showLimit(undefined)).toBe(12)
    expect(showLimit('13')).toBe(24)
    expect(showLimit('9999')).toBe(96)
    expect(showLimit('nope')).toBe(12)
  })
  it('treats sort alone as not filtering', () => {
    expect(isFiltering({ sort: 'name' })).toBe(false)
    expect(isFiltering({ following: '1' })).toBe(true)
  })
})
