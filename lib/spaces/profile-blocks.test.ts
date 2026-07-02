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

  it('respects space-type restrictions', () => {
    // business: no booking (practitioner-only), yes business-presence block
    const biz = defaultProfileLayout('business', fns('availability', 'members'))
    expect(biz).not.toContain('booking')
    expect(biz).toContain('business')
    // practitioner: no business-presence block, but offerings applies (no required function)
    const prac = defaultProfileLayout('practitioner', fns())
    expect(prac).not.toContain('business')
    expect(prac).toContain('offerings')
  })

  it('always includes the universal content sections', () => {
    const layout = defaultProfileLayout('organization', fns())
    for (const id of ['about', 'highlights', 'events', 'reviews', 'faq', 'updates', 'contact'] as const) {
      expect(layout).toContain(id)
    }
  })
})
