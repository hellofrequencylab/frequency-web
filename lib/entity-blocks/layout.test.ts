import { describe, it, expect } from 'vitest'
import {
  parseEntityLayout,
  mergeEntityLayout,
  sanitizeEntityLayout,
  layoutSlots,
  type EntityLayout,
} from './layout'

describe('slot-key injection guard (CodeQL remote property injection)', () => {
  it('drops unknown / dangerous slot keys on parse', () => {
    const parsed = parseEntityLayout({
      slots: { __proto__: ['about'], constructor: ['about'], bogus: ['about'] },
    })
    expect(parsed?.slots).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('keeps a known slot key on parse', () => {
    expect(parseEntityLayout({ slots: { main: ['about'] } })?.slots).toEqual({ main: ['about'] })
  })

  it('drops unknown slot keys on sanitize', () => {
    const clean = sanitizeEntityLayout({ slots: { __proto__: ['about'], main: ['about'] } }, 'space')
    expect(Object.keys(clean?.slots ?? {})).toEqual(['main'])
  })
})

// The member palette (about/stats/links/topfriends + content blocks) and space-only ids drive the
// kind-filtering cases below. Ids used: 'about','stats','links','topfriends' (member), 'offerings'
// (space-only), 'heading' (shared content).

describe('parseEntityLayout', () => {
  it('returns null for non-objects', () => {
    expect(parseEntityLayout(null)).toBeNull()
    expect(parseEntityLayout(undefined)).toBeNull()
    expect(parseEntityLayout('x')).toBeNull()
    expect(parseEntityLayout(['about'])).toBeNull()
    expect(parseEntityLayout(42)).toBeNull()
  })

  it('returns null for an object with no recognised keys', () => {
    expect(parseEntityLayout({})).toBeNull()
    expect(parseEntityLayout({ foo: 'bar' })).toBeNull()
  })

  it('reads a grid shape (template + slots + hidden)', () => {
    const parsed = parseEntityLayout({
      template: 'main-side',
      slots: { main: ['about', 'stats'], side: ['links'], junk: [] },
      hidden: ['topfriends'],
    })
    expect(parsed).toEqual({
      template: 'main-side',
      slots: { main: ['about', 'stats'], side: ['links'] },
      hidden: ['topfriends'],
    })
  })

  it('drops a bad template and non-string slot entries', () => {
    const parsed = parseEntityLayout({
      template: 'nope',
      slots: { main: ['about', 7, null, 'stats'] },
    })
    expect(parsed).toEqual({ slots: { main: ['about', 'stats'] } })
  })

  it('reads the flat back-compat order shape', () => {
    expect(parseEntityLayout({ order: ['about', 'links'] })).toEqual({ order: ['about', 'links'] })
  })
})

describe('mergeEntityLayout', () => {
  const memberDefaults = ['about', 'stats', 'links', 'topfriends']

  it('null saved → fresh default in the single template default slot', () => {
    const merged = mergeEntityLayout(memberDefaults, null, 'member')
    expect(merged.template).toBe('single')
    expect(merged.slots).toEqual({ main: ['about', 'stats', 'links', 'topfriends'] })
    expect(merged.hidden).toEqual([])
  })

  it('keeps a saved template and assigns ids to their slots', () => {
    const saved: EntityLayout = {
      template: 'main-side',
      slots: { main: ['stats', 'about'], side: ['links'] },
    }
    const merged = mergeEntityLayout(memberDefaults, saved, 'member')
    expect(merged.template).toBe('main-side')
    // 'links' stays in side; 'topfriends' was never placed → appended to the default (main) slot.
    expect(merged.slots?.main).toEqual(['stats', 'about', 'topfriends'])
    expect(merged.slots?.side).toEqual(['links'])
  })

  it('drops hidden ids from every slot', () => {
    const saved: EntityLayout = { slots: { main: ['about', 'stats', 'links', 'topfriends'] }, hidden: ['stats'] }
    const merged = mergeEntityLayout(memberDefaults, saved, 'member')
    expect(merged.slots?.main).not.toContain('stats')
    expect(merged.hidden).toContain('stats')
  })

  it('appends a new default id the saved layout never placed', () => {
    const saved: EntityLayout = { slots: { main: ['about'] }, hidden: ['stats', 'links', 'topfriends'] }
    const withNew = mergeEntityLayout([...memberDefaults, 'heading'], saved, 'member')
    // hidden ones stay out; the brand-new 'heading' is appended to main.
    expect(withNew.slots?.main).toEqual(['about', 'heading'])
  })

  it('filters ids that do not support the kind', () => {
    // 'offerings' is space-only; asked for a member it must be dropped.
    const saved: EntityLayout = { slots: { main: ['about', 'offerings'] } }
    const merged = mergeEntityLayout(['about', 'offerings', 'stats'], saved, 'member')
    expect(merged.slots?.main).not.toContain('offerings')
    expect(merged.slots?.main).toContain('about')
  })

  it('reads the flat back-compat order into the default slot', () => {
    const merged = mergeEntityLayout(memberDefaults, { order: ['links', 'about'] }, 'member')
    expect(merged.template).toBe('single')
    // saved order first, then the untouched defaults appended.
    expect(merged.slots?.main).toEqual(['links', 'about', 'stats', 'topfriends'])
  })

  it('reassigns ids from a slot the new template no longer has into the default slot', () => {
    // Saved under a 3-slot template, but the layout now resolves under single (bad template ignored).
    const saved: EntityLayout = { template: 'nope' as never, slots: { side: ['links'], 'col-2': ['stats'] } }
    const merged = mergeEntityLayout(memberDefaults, saved, 'member')
    expect(merged.template).toBe('single')
    // everything lands in main.
    expect(new Set(merged.slots?.main)).toEqual(new Set(['links', 'stats', 'about', 'topfriends']))
  })
})

describe('layoutSlots', () => {
  it('lists visible ids per slot in template order', () => {
    const rows = layoutSlots({ template: 'main-side', slots: { main: ['about'], side: ['links'] } })
    expect(rows).toEqual([
      { slot: 'main', ids: ['about'] },
      { slot: 'side', ids: ['links'] },
    ])
  })

  it('reads a flat order as the single template main slot', () => {
    expect(layoutSlots({ order: ['about', 'stats'] })).toEqual([{ slot: 'main', ids: ['about', 'stats'] }])
  })
})
