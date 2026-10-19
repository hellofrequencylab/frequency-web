import { describe, expect, it } from 'vitest'
import { distanceLabel, endsLine, nearbyLine, rankNearby } from './nearby'

const space = (over: Partial<Parameters<typeof rankNearby>[0][number]>) => ({
  spaceId: over.slug ?? 'x',
  slug: 'x',
  name: 'X',
  city: null,
  latitude: null,
  longitude: null,
  rewardTitle: 'Free coffee',
  rewardValueCents: 600,
  stampsRequired: 6,
  ...over,
})

describe('rankNearby', () => {
  it('orders by distance from home, Spaces with no pin last', () => {
    const rows = rankNearby(
      [
        space({ slug: 'far', name: 'Far', latitude: 33.2, longitude: -117.2 }),
        space({ slug: 'nopin', name: 'No pin' }),
        space({ slug: 'near', name: 'Near', latitude: 33.13, longitude: -117.3 }),
      ],
      { lat: 33.13, lng: -117.31, city: null },
    )
    expect(rows.map((r) => r.slug)).toEqual(['near', 'far', 'nopin'])
    expect(rows[0].distanceMiles).toBeLessThan(1)
    expect(rows[2].distanceMiles).toBeNull()
  })

  it('puts the member city first and then names when there is no home pin', () => {
    const rows = rankNearby(
      [space({ slug: 'b', name: 'Bravo', city: 'Vista' }), space({ slug: 'a', name: 'Alpha', city: 'Carlsbad' }), space({ slug: 'c', name: 'Charlie', city: 'vista' })],
      { lat: null, lng: null, city: 'Vista' },
    )
    expect(rows.map((r) => r.slug)).toEqual(['b', 'c', 'a'])
  })

  it('caps the list', () => {
    expect(rankNearby([space({ slug: 'a' }), space({ slug: 'b' })], { lat: null, lng: null, city: null }, 1)).toHaveLength(1)
  })
})

describe('copy', () => {
  it('prints the card line, the distance and the hunt end', () => {
    expect(nearbyLine({ stampsRequired: 6, rewardTitle: 'a free coffee', rewardValueCents: 600 })).toBe('6 visits earn a free coffee ($6)')
    expect(nearbyLine({ stampsRequired: 3, rewardTitle: '', rewardValueCents: 0 })).toBe('3 visits earn a reward')
    expect(distanceLabel(0.44)).toBe('0.4 mi')
    expect(distanceLabel(12.6)).toBe('13 mi')
    expect(distanceLabel(null)).toBeNull()
    expect(endsLine('2026-11-30')).toBe('Ends Nov 30')
    expect(endsLine('soon')).toBe('Ends soon')
  })
})
