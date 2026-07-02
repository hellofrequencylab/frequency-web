import { describe, it, expect } from 'vitest'
import {
  parseSavedProfileLayout,
  mergeProfileLayout,
  effectiveProfileLayout,
  type SavedProfileLayout,
} from './profile-layout'
import type { ProfileBlockId } from './profile-blocks'

// A representative default layout (a subset of the registry, in order) the merge operates over.
const DEFAULT: ProfileBlockId[] = ['about', 'highlights', 'offerings', 'events', 'team']

describe('parseSavedProfileLayout (fail-safe read)', () => {
  it('reads a well-formed profileLayout blob', () => {
    const prefs = { profileLayout: { order: ['team', 'about'], hidden: ['events'] } }
    expect(parseSavedProfileLayout(prefs)).toEqual({ order: ['team', 'about'], hidden: ['events'] })
  })

  it('returns null when profileLayout is absent or the wrong shape', () => {
    expect(parseSavedProfileLayout(null)).toBeNull()
    expect(parseSavedProfileLayout('nope')).toBeNull()
    expect(parseSavedProfileLayout([1, 2])).toBeNull()
    expect(parseSavedProfileLayout({})).toBeNull()
    expect(parseSavedProfileLayout({ profileLayout: 'bad' })).toBeNull()
    expect(parseSavedProfileLayout({ profileLayout: ['about'] })).toBeNull()
  })

  it('ignores unknown ids and de-duplicates', () => {
    const prefs = { profileLayout: { order: ['about', 'not-a-block', 'about', 42], hidden: ['ghost'] } }
    expect(parseSavedProfileLayout(prefs)).toEqual({ order: ['about'] })
  })
})

describe('mergeProfileLayout', () => {
  it('null saved leaves the default unchanged (a fresh copy)', () => {
    const merged = mergeProfileLayout(DEFAULT, null)
    expect(merged).toEqual(DEFAULT)
    expect(merged).not.toBe(DEFAULT)
  })

  it('reorders blocks by the saved order', () => {
    const saved: SavedProfileLayout = { order: ['team', 'about', 'highlights', 'offerings', 'events'] }
    expect(mergeProfileLayout(DEFAULT, saved)).toEqual([
      'team',
      'about',
      'highlights',
      'offerings',
      'events',
    ])
  })

  it('drops hidden blocks', () => {
    const saved: SavedProfileLayout = { order: DEFAULT, hidden: ['offerings', 'team'] }
    expect(mergeProfileLayout(DEFAULT, saved)).toEqual(['about', 'highlights', 'events'])
  })

  it('appends default blocks the saved order never mentions, in default order', () => {
    // Operator only arranged two blocks; the rest append in default order behind them.
    const saved: SavedProfileLayout = { order: ['team', 'about'] }
    expect(mergeProfileLayout(DEFAULT, saved)).toEqual([
      'team',
      'about',
      'highlights',
      'offerings',
      'events',
    ])
  })

  it('drops saved ids no longer in the default (a feature turned off)', () => {
    // 'booking' was saved while availability was on; the default no longer includes it.
    const saved: SavedProfileLayout = { order: ['booking', 'about', 'events'] }
    const merged = mergeProfileLayout(DEFAULT, saved)
    expect(merged).not.toContain('booking')
    expect(merged[0]).toBe('about')
    expect(merged).toContain('events')
  })

  it('never returns an id absent from the default', () => {
    const saved: SavedProfileLayout = {
      order: ['team', 'circles', 'about'],
      hidden: ['faq'],
    }
    const merged = mergeProfileLayout(DEFAULT, saved)
    for (const id of merged) expect(DEFAULT).toContain(id)
  })
})

describe('effectiveProfileLayout (default + saved, off a space)', () => {
  // A practitioner with no plan-gated functions: universal blocks apply; 'booking'/'team' need
  // availability/members which are OFF here, so they are absent from the fresh default.
  const space = { type: 'practitioner' as const, entitlements: {} }

  it('a null / malformed blob yields the fresh default', () => {
    const fresh = effectiveProfileLayout(space, undefined)
    expect(effectiveProfileLayout(space, { profileLayout: 'bad' })).toEqual(fresh)
    expect(fresh.length).toBeGreaterThan(0)
  })

  it('honors a saved reorder + hide against the real default', () => {
    const fresh = effectiveProfileLayout(space, undefined)
    const first = fresh[0]
    const second = fresh[1]
    const merged = effectiveProfileLayout(space, {
      profileLayout: { order: [second, first], hidden: [first] },
    })
    expect(merged).not.toContain(first) // hidden
    expect(merged[0]).toBe(second) // reordered to the top
  })
})
