import { describe, it, expect } from 'vitest'
import {
  SPINE_ORDER,
  SPINE_META,
  groupIntoSpine,
  summaryFor,
  shouldFlatten,
} from './spine'
import type { AdminSlot } from './registry'

// The spine is pure browse metadata (docs/ADMIN-RAIL.md Phase 3). These lock the three decisions the
// drill-down depends on: fixed-order grouping, drop-empty, and the single-category collapse.

const app = (id: string, category: AdminSlot | 'element', label = id) => ({ id, category, label })

describe('SPINE_META', () => {
  it('covers every spine slot with a label + icon', () => {
    for (const slot of SPINE_ORDER) {
      expect(SPINE_META[slot], slot).toBeTruthy()
      expect(typeof SPINE_META[slot].label).toBe('string')
      expect(SPINE_META[slot].Icon).toBeTruthy()
    }
  })

  it('uses voice-canon noun labels with no em dashes', () => {
    for (const slot of SPINE_ORDER) {
      expect(SPINE_META[slot].label).not.toMatch(/—/)
    }
    expect(SPINE_META.place.label).toBe('Place & Time')
    expect(SPINE_META.basics.label).toBe('Basics')
  })
})

describe('groupIntoSpine', () => {
  it('emits populated slots in fixed SPINE_ORDER regardless of input order', () => {
    const apps = [app('d', 'danger'), app('b', 'people'), app('a', 'basics'), app('c', 'engage')]
    expect(groupIntoSpine(apps).map((g) => g.slot)).toEqual(['basics', 'people', 'engage', 'danger'])
  })

  it('drops empty slots (only populated categories survive)', () => {
    const groups = groupIntoSpine([app('a', 'basics')])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toEqual({ slot: 'basics', appIds: ['a'] })
  })

  it('preserves within-slot input order and ignores non-spine categories', () => {
    const apps = [app('a1', 'basics'), app('a2', 'basics'), app('el', 'element')]
    expect(groupIntoSpine(apps)).toEqual([{ slot: 'basics', appIds: ['a1', 'a2'] }])
  })

  it('returns [] for no apps', () => {
    expect(groupIntoSpine([])).toEqual([])
  })
})

describe('summaryFor', () => {
  it('joins the slot labels while short', () => {
    const apps = [app('a', 'basics', 'Circle settings'), app('b', 'basics', 'Page text')]
    expect(summaryFor('basics', apps)).toBe('Circle settings, Page text')
  })

  it('falls back to an N-settings count past three', () => {
    const apps = [1, 2, 3, 4].map((n) => app(`a${n}`, 'people', `P${n}`))
    expect(summaryFor('people', apps)).toBe('4 settings')
  })

  it('is empty for a slot with no catalog apps', () => {
    expect(summaryFor('layout', [app('a', 'basics', 'Basics')])).toBe('')
  })
})

describe('shouldFlatten', () => {
  const cat = (slot: AdminSlot) => ({ slot })

  it('flattens zero or one populated category (no extras)', () => {
    expect(shouldFlatten([])).toBe(true)
    expect(shouldFlatten([cat('basics')])).toBe(true)
  })

  it('shows the home list once there are two or more categories', () => {
    expect(shouldFlatten([cat('basics'), cat('place')])).toBe(false)
  })

  it('treats the operator Page group as a drill target', () => {
    // One category + the Page group = two targets → home list (do not collapse).
    expect(shouldFlatten([cat('basics')], { hasExtras: true })).toBe(false)
    // The Page group alone is one target → still flat.
    expect(shouldFlatten([], { hasExtras: true })).toBe(true)
  })
})
