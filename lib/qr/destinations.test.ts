import { describe, it, expect } from 'vitest'
import { SITE_DESTINATIONS, isKnownDestination, groupedDestinations } from './destinations'

describe('site destinations', () => {
  it('every destination has a real value line and a root-relative path', () => {
    for (const d of SITE_DESTINATIONS) {
      expect(d.value.length).toBeGreaterThan(10) // demonstrates value, not a stub
      expect(d.path.startsWith('/')).toBe(true)
      expect(d.label.length).toBeGreaterThan(0)
    }
  })

  it('isKnownDestination matches curated paths only', () => {
    expect(isKnownDestination('/circles')).toBe(true)
    expect(isKnownDestination('/discover/events')).toBe(true)
    expect(isKnownDestination('https://evil.example')).toBe(false)
    expect(isKnownDestination('/not-a-destination')).toBe(false)
  })

  it('grouping preserves order and covers every destination once', () => {
    const groups = groupedDestinations()
    const total = groups.reduce((n, g) => n + g.items.length, 0)
    expect(total).toBe(SITE_DESTINATIONS.length)
    // groups are unique
    expect(new Set(groups.map((g) => g.group)).size).toBe(groups.length)
  })
})
