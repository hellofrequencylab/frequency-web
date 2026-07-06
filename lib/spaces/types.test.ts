import { describe, it, expect } from 'vitest'
import { spaceManageHref, isConsoleSpaceType, normalizeSpaceType } from './types'

// spaceManageHref is the ONE place the Spaces harmonization rule lives (ADR-441 EM1-3 / EM2-3): the
// unified /manage console serves every provisionable type; only root keeps the legacy /settings hub.
// After the ADR-552 collapse the provisionable set is just `business` + `nonprofit`. Lock both halves
// so a new console type is a deliberate, tested change.
describe('spaceManageHref (the Spaces management-entry rule)', () => {
  it('routes every CONSOLE type to /manage', () => {
    for (const type of ['business', 'nonprofit'] as const) {
      expect(spaceManageHref(type, 'demo')).toBe('/spaces/demo/manage')
      expect(isConsoleSpaceType(type)).toBe(true)
    }
  })

  it('routes the legacy-hub type (root) to /settings', () => {
    expect(spaceManageHref('root', 'demo')).toBe('/spaces/demo/settings')
    expect(isConsoleSpaceType('root')).toBe(false)
  })
})

// The read-time legacy normalizer (ADR-552): the backfill migration ships file-only, so a live row can
// still hold a retired type. Every DB row -> Space mapping runs it through normalizeSpaceType, so the
// runtime type is always a valid SpaceType and passes isConsoleSpaceType (the fix for the manage
// console / page builder going dark, and the chip reading "Practitioner", on an unmigrated row).
describe('normalizeSpaceType (legacy row folding)', () => {
  it('folds every retired public type into business', () => {
    for (const legacy of ['practitioner', 'coaching', 'event_space', 'lab', 'partner']) {
      expect(normalizeSpaceType(legacy)).toBe('business')
      expect(isConsoleSpaceType(normalizeSpaceType(legacy))).toBe(true)
    }
  })
  it('renames organization to nonprofit and keeps root + collapsed values', () => {
    expect(normalizeSpaceType('organization')).toBe('nonprofit')
    expect(normalizeSpaceType('nonprofit')).toBe('nonprofit')
    expect(normalizeSpaceType('business')).toBe('business')
    expect(normalizeSpaceType('root')).toBe('root')
  })
  it('fails safe to business on empty/garbage', () => {
    expect(normalizeSpaceType(null)).toBe('business')
    expect(normalizeSpaceType(undefined)).toBe('business')
    expect(normalizeSpaceType('whatever')).toBe('business')
  })
})
