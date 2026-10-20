import { describe, it, expect } from 'vitest'
import { pickCirclesForming, type FormingCircle } from './circles-forming'

const c = (id: string, city: string | null, n = 1): FormingCircle => ({
  id,
  name: `Circle ${id}`,
  slug: id,
  city,
  member_count: n,
  created_at: '2026-10-01T00:00:00Z',
})

const newest = [c('a', 'Encinitas'), c('b', 'Carlsbad'), c('c', 'encinitas '), c('d', null), c('e', 'Oceanside')]

describe('pickCirclesForming', () => {
  it('lists the viewer’s own city first and says which city', () => {
    const r = pickCirclesForming(newest, 'Encinitas')
    expect(r.city).toBe('Encinitas')
    expect(r.circles.map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('matches the city without regard to case or stray spaces', () => {
    expect(pickCirclesForming(newest, '  CARLSBAD ').circles.map((x) => x.id)).toEqual(['b'])
  })

  it('falls back to the community-wide newest, unscoped, when the city has none', () => {
    const r = pickCirclesForming(newest, 'Vista')
    expect(r.city).toBeNull()
    expect(r.circles.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('is unscoped when the viewer has no city', () => {
    expect(pickCirclesForming(newest, null).city).toBeNull()
    expect(pickCirclesForming(newest, '').city).toBeNull()
  })

  it('caps the list', () => {
    expect(pickCirclesForming(newest, null, 2).circles).toHaveLength(2)
  })
})
