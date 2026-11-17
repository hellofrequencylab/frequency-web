import { describe, expect, it } from 'vitest'
import { FALLBACK_HIDDEN, isHiddenRoute } from './hidden-routes-shared'

describe('isHiddenRoute (SRCH-002)', () => {
  it('hides the route and every page beneath it', () => {
    expect(isHiddenRoute('/classifieds', FALLBACK_HIDDEN)).toBe(true)
    expect(isHiddenRoute('/classifieds/new', FALLBACK_HIDDEN)).toBe(true)
    expect(isHiddenRoute('/housing/roommates?x=1', FALLBACK_HIDDEN)).toBe(true)
    expect(isHiddenRoute('/network#top', FALLBACK_HIDDEN)).toBe(true)
  })
  it('never swallows a sibling that only shares a prefix', () => {
    expect(isHiddenRoute('/networks', FALLBACK_HIDDEN)).toBe(false)
    expect(isHiddenRoute('/market', FALLBACK_HIDDEN)).toBe(false)
    expect(isHiddenRoute('/events', FALLBACK_HIDDEN)).toBe(false)
  })
  it('keeps Journeys searchable by owner ruling 2026-11-17', () => {
    expect(isHiddenRoute('/journeys/morning-reset', FALLBACK_HIDDEN)).toBe(false)
  })
})
