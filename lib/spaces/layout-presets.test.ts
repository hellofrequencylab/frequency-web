import { describe, it, expect } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import {
  readLayoutPreset,
  readSpaceLayoutDefault,
  withLayoutPreset,
  withSpaceLayoutDefault,
  applyLayoutPreset,
  normalizeTemplate,
  ALL_PAGES_KEY,
  DEFAULT_LAYOUT_PRESET,
} from './layout-presets'

const flat = {
  root: {},
  content: [
    { type: 'SpaceHighlights', props: { id: 'h' } },
    { type: 'SpaceOfferings', props: { id: 'o' } },
    { type: 'SpaceContact', props: { id: 'c' } },
    { type: 'SpaceBooking', props: { id: 'b' } },
    { type: 'SpaceBusiness', props: { id: 'biz' } },
  ],
} as unknown as Data

type Arr = {
  type: string
  props: {
    variant: string
    hasHeader: string
    sideSticky: string
    header: { type: string }[]
    main: { type: string }[]
    side: { type: string }[]
    col3: { type: string }[]
  }
}
const asArrangement = (d: Data): Arr => d.content[0] as unknown as Arr

describe('normalizeTemplate (legacy backward-compat mapping)', () => {
  it('maps legacy preset values to the current template ids', () => {
    expect(normalizeTemplate('stack')).toBe('single')
    expect(normalizeTemplate('main-rail')).toBe('main-side')
    expect(normalizeTemplate('sections')).toBe('single')
  })
  it('passes the current template ids through', () => {
    for (const id of ['single', 'main-side', 'two-col', 'three-col', 'header-side'] as const) {
      expect(normalizeTemplate(id)).toBe(id)
    }
  })
  it('falls back to single for anything unknown', () => {
    expect(normalizeTemplate('bogus')).toBe('single')
    expect(normalizeTemplate(undefined)).toBe('single')
    expect(normalizeTemplate(null)).toBe('single')
  })
})

describe('readLayoutPreset / withLayoutPreset', () => {
  it('defaults to single for a missing / malformed blob', () => {
    expect(readLayoutPreset(undefined, 'home')).toBe('single')
    expect(readLayoutPreset({}, 'home')).toBe('single')
    expect(readLayoutPreset({ pageLayouts: 'nope' }, 'home')).toBe('single')
    expect(readLayoutPreset({ pageLayouts: { home: 'bogus' } }, 'home')).toBe(DEFAULT_LAYOUT_PRESET)
  })

  it('still resolves a legacy stored value (backward compat)', () => {
    expect(readLayoutPreset({ pageLayouts: { home: 'stack' } }, 'home')).toBe('stack')
    expect(readLayoutPreset({ pageLayouts: { home: 'main-rail' } }, 'home')).toBe('main-rail')
    // and it collapses to the right current template
    expect(normalizeTemplate(readLayoutPreset({ pageLayouts: { home: 'main-rail' } }, 'home'))).toBe('main-side')
  })

  it('reads a per-page template and is immutable on write', () => {
    const prefs = { coverSize: 'hero' }
    const next = withLayoutPreset(prefs, 'home', 'main-side')
    expect(readLayoutPreset(next, 'home')).toBe('main-side')
    expect(readLayoutPreset(next, 'classes')).toBe('single') // other pages inherit the default (single)
    expect((next as { coverSize?: string }).coverSize).toBe('hero') // siblings preserved
    expect('pageLayouts' in prefs).toBe(false) // input untouched
  })

  it('clears the entry (and the map) when set back to the default', () => {
    const prefs = withLayoutPreset({}, 'home', 'two-col')
    expect('pageLayouts' in prefs).toBe(true)
    const cleared = withLayoutPreset(prefs, 'home', 'single')
    expect('pageLayouts' in cleared).toBe(false)
  })

  it('never writes a prototype-pollution / non-slug key (security guard)', () => {
    for (const bad of ['__proto__', 'constructor', 'prototype', 'has space', 'Home', 'trailing-', '*']) {
      const next = withLayoutPreset({}, bad, 'main-side')
      expect('pageLayouts' in next).toBe(false)
      expect((({}) as Record<string, unknown>).polluted).toBeUndefined()
      expect(readLayoutPreset(next, bad)).toBe('single')
    }
    // A valid kebab slug still writes normally.
    expect(readLayoutPreset(withLayoutPreset({}, 'about-us', 'three-col'), 'about-us')).toBe('three-col')
  })
})

describe('readSpaceLayoutDefault / withSpaceLayoutDefault (the All-pages scope)', () => {
  it('defaults to single with no stored default', () => {
    expect(readSpaceLayoutDefault(undefined)).toBe('single')
    expect(readSpaceLayoutDefault({})).toBe('single')
  })

  it('stores the All-pages default at the reserved key and reads it back', () => {
    const next = withSpaceLayoutDefault({}, 'main-side')
    expect((next.pageLayouts as Record<string, unknown>)[ALL_PAGES_KEY]).toBe('main-side')
    expect(readSpaceLayoutDefault(next)).toBe('main-side')
  })

  it('a page with no own template inherits the All-pages default; its own template wins', () => {
    const withDefault = withSpaceLayoutDefault({}, 'two-col')
    expect(readLayoutPreset(withDefault, 'home')).toBe('two-col') // inherited
    const withOwn = withLayoutPreset(withDefault, 'home', 'header-side')
    expect(readLayoutPreset(withOwn, 'home')).toBe('header-side') // own wins
    expect(readLayoutPreset(withOwn, 'classes')).toBe('two-col') // still inherits
  })

  it('preserves the reserved default when a sibling per-page write happens (carry-over)', () => {
    const withDefault = withSpaceLayoutDefault({}, 'main-side')
    const withPage = withLayoutPreset(withDefault, 'about-us', 'three-col')
    expect(readSpaceLayoutDefault(withPage)).toBe('main-side') // not dropped
    expect(readLayoutPreset(withPage, 'about-us')).toBe('three-col')
  })

  it('clears the reserved default (and the map) when set back to single', () => {
    const withDefault = withSpaceLayoutDefault({}, 'main-side')
    const cleared = withSpaceLayoutDefault(withDefault, 'single')
    expect('pageLayouts' in cleared).toBe(false)
  })
})

describe('applyLayoutPreset (pure display transform)', () => {
  it('leaves the content flat for single (and legacy stack / sections)', () => {
    expect(applyLayoutPreset(flat, 'single')).toEqual(flat)
    expect(applyLayoutPreset(flat, 'stack')).toEqual(flat)
    expect(applyLayoutPreset(flat, 'sections')).toEqual(flat)
  })

  it('main-side: partitions into a SpaceArrangement main + side rail, no header', () => {
    const arranged = applyLayoutPreset(flat, 'main-side')
    expect(arranged.content).toHaveLength(1)
    const a = asArrangement(arranged)
    expect(a.type).toBe('SpaceArrangement')
    expect(a.props.variant).toBe('main-side')
    expect(a.props.hasHeader).toBe('no')
    expect(a.props.main.map((b) => b.type)).toEqual(['SpaceOfferings', 'SpaceBooking'])
    expect(a.props.side.map((b) => b.type)).toEqual(['SpaceHighlights', 'SpaceContact', 'SpaceBusiness'])
    // the input doc is untouched (content is not mutated in storage)
    expect(flat.content).toHaveLength(5)
  })

  it('main-side (legacy main-rail) resolves to the same arrangement', () => {
    expect(applyLayoutPreset(flat, 'main-rail')).toEqual(applyLayoutPreset(flat, 'main-side'))
  })

  it('main-side keeps the flat list when nothing is rail-worthy', () => {
    const mainOnly = {
      root: {},
      content: [{ type: 'SpaceOfferings', props: {} }, { type: 'SpaceBooking', props: {} }],
    } as unknown as Data
    expect(applyLayoutPreset(mainOnly, 'main-side')).toEqual(mainOnly)
  })

  it('header-side: first block is a full-width header, the rest is a main + side split', () => {
    const a = asArrangement(applyLayoutPreset(flat, 'header-side'))
    expect(a.props.variant).toBe('main-side')
    expect(a.props.hasHeader).toBe('yes')
    expect(a.props.header.map((b) => b.type)).toEqual(['SpaceHighlights'])
    expect(a.props.main.map((b) => b.type)).toEqual(['SpaceOfferings', 'SpaceBooking'])
    expect(a.props.side.map((b) => b.type)).toEqual(['SpaceContact', 'SpaceBusiness'])
  })

  it('two-col: header row over two equal columns (round-robin, order preserved)', () => {
    const a = asArrangement(applyLayoutPreset(flat, 'two-col'))
    expect(a.props.variant).toBe('two-equal')
    expect(a.props.hasHeader).toBe('yes')
    expect(a.props.header.map((b) => b.type)).toEqual(['SpaceHighlights'])
    // rest = [Offerings, Contact, Booking, Business] round-robin over 2
    expect(a.props.main.map((b) => b.type)).toEqual(['SpaceOfferings', 'SpaceBooking'])
    expect(a.props.side.map((b) => b.type)).toEqual(['SpaceContact', 'SpaceBusiness'])
  })

  it('three-col: header row over three equal columns (round-robin)', () => {
    const a = asArrangement(applyLayoutPreset(flat, 'three-col'))
    expect(a.props.variant).toBe('three-equal')
    expect(a.props.hasHeader).toBe('yes')
    expect(a.props.header.map((b) => b.type)).toEqual(['SpaceHighlights'])
    // rest = [Offerings, Contact, Booking, Business] round-robin over 3
    expect(a.props.main.map((b) => b.type)).toEqual(['SpaceOfferings', 'SpaceBusiness'])
    expect(a.props.side.map((b) => b.type)).toEqual(['SpaceContact'])
    expect(a.props.col3.map((b) => b.type)).toEqual(['SpaceBooking'])
  })

  it('falls back to the flat list for a header template with fewer than two blocks', () => {
    const one = { root: {}, content: [{ type: 'SpaceOfferings', props: {} }] } as unknown as Data
    expect(applyLayoutPreset(one, 'two-col')).toEqual(one)
    expect(applyLayoutPreset(one, 'header-side')).toEqual(one)
  })

  it('respects an explicit SpaceLayout / SpaceArrangement the operator already placed', () => {
    const withLayout = {
      root: {},
      content: [{ type: 'SpaceLayout', props: { main: [], side: [] } }],
    } as unknown as Data
    expect(applyLayoutPreset(withLayout, 'two-col')).toEqual(withLayout)
    const withArrangement = {
      root: {},
      content: [{ type: 'SpaceArrangement', props: { main: [], side: [] } }],
    } as unknown as Data
    expect(applyLayoutPreset(withArrangement, 'three-col')).toEqual(withArrangement)
  })

  it('tolerates a malformed doc', () => {
    const junk = { root: {}, content: 'nope' } as unknown as Data
    expect(applyLayoutPreset(junk, 'main-side')).toEqual(junk)
  })
})
