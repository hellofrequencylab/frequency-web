import { describe, it, expect } from 'vitest'
import { PROFILE_BLOCKS, profileBlockById, defaultProfileLayout } from './profile-blocks'
import type { SpaceFunctionKey } from './functions'

const fns = (...keys: SpaceFunctionKey[]): ReadonlySet<SpaceFunctionKey> => new Set(keys)

describe('profile block registry', () => {
  it('has unique ids and strictly ascending order', () => {
    const ids = PROFILE_BLOCKS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    const orders = PROFILE_BLOCKS.map((b) => b.order)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  it('looks a block up by id', () => {
    expect(profileBlockById('booking')?.label).toBe('Booking')
    expect(profileBlockById('nope')).toBeNull()
  })

  it('carries no em dashes in copy (CONTENT-VOICE §10)', () => {
    const copy = JSON.stringify(PROFILE_BLOCKS)
    expect(copy).not.toContain('—')
  })
})

describe('defaultProfileLayout (fresh default from type + enabled functions)', () => {
  it('a practitioner with availability + members gets booking and team, in order', () => {
    const layout = defaultProfileLayout('practitioner', fns('availability', 'members'))
    expect(layout).toContain('booking')
    expect(layout).toContain('team')
    expect(layout).toContain('offerings')
    // order preserved
    expect(layout.indexOf('about')).toBeLessThan(layout.indexOf('booking'))
    expect(layout.indexOf('booking')).toBeLessThan(layout.indexOf('team'))
  })

  it('drops function-gated blocks when the function is off', () => {
    const layout = defaultProfileLayout('practitioner', fns())
    expect(layout).not.toContain('booking') // needs availability
    expect(layout).not.toContain('team') // needs members
    expect(layout).toContain('about') // universal content stays
  })

  it('gates by function only, never by space type (the per-type gate was retired)', () => {
    // Same enabled functions => the SAME block set for any type: booking follows the `availability`
    // function; business + offerings are universal content (no required function). This locks the
    // function-only palette the live grid path (blocksForKind('space')) also uses.
    const withFns = fns('availability', 'members')
    const biz = defaultProfileLayout('business', withFns)
    const prac = defaultProfileLayout('practitioner', withFns)
    expect(biz).toEqual(prac)
    expect(prac).toContain('booking') // availability on => booking, on any type
    expect(prac).toContain('business') // universal content, on any type
    expect(prac).toContain('offerings')
  })

  it('always includes the universal content sections', () => {
    const layout = defaultProfileLayout('organization', fns())
    for (const id of ['about', 'highlights', 'events', 'reviews', 'faq', 'updates', 'contact'] as const) {
      expect(layout).toContain(id)
    }
  })
})
