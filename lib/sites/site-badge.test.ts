import { describe, expect, it } from 'vitest'
import { asFooterBadgeMode, badgeRemovalHeld, effectiveFooterBadge, nextFooterBadgePreferences, readFooterBadge } from './site-badge'

describe('readFooterBadge', () => {
  it('defaults to the badge', () => {
    expect(readFooterBadge(null)).toBe('badge')
    expect(readFooterBadge({})).toBe('badge')
    expect(readFooterBadge({ siteBadge: 'huge' })).toBe('badge')
    expect(readFooterBadge([])).toBe('badge')
  })
  it('reads a valid choice', () => {
    expect(readFooterBadge({ siteBadge: 'line' })).toBe('line')
    expect(readFooterBadge({ siteBadge: 'none' })).toBe('none')
  })
  it('narrows modes', () => {
    expect(asFooterBadgeMode('none')).toBe('none')
    expect(asFooterBadgeMode(1)).toBeNull()
  })
})

describe('badge removal gate', () => {
  it('holds for Independent or the add-on only', () => {
    expect(badgeRemovalHeld('independent', {})).toBe(true)
    expect(badgeRemovalHeld('business', { badge_removal: true })).toBe(true)
    expect(badgeRemovalHeld('business', { badge_removal: 'true' })).toBe(false)
    expect(badgeRemovalHeld('business', null)).toBe(false)
    expect(badgeRemovalHeld(null, undefined)).toBe(false)
  })
  it('puts the badge back when none is not paid for', () => {
    expect(effectiveFooterBadge('none', false)).toBe('badge')
    expect(effectiveFooterBadge('none', true)).toBe('none')
    expect(effectiveFooterBadge('line', false)).toBe('line')
  })
})

describe('nextFooterBadgePreferences', () => {
  it('writes only its own key and clears on the default', () => {
    expect(nextFooterBadgePreferences({ a: 1 }, 'line')).toEqual({ a: 1, siteBadge: 'line' })
    expect(nextFooterBadgePreferences({ a: 1, siteBadge: 'line' }, 'badge')).toEqual({ a: 1 })
  })
})
