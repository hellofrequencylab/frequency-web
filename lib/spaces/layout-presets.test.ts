import { describe, it, expect } from 'vitest'
import type { Data } from '@measured/puck'
import {
  readLayoutPreset,
  withLayoutPreset,
  applyLayoutPreset,
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

describe('readLayoutPreset / withLayoutPreset', () => {
  it('defaults to stack for a missing / malformed blob', () => {
    expect(readLayoutPreset(undefined, 'home')).toBe('stack')
    expect(readLayoutPreset({}, 'home')).toBe('stack')
    expect(readLayoutPreset({ pageLayouts: 'nope' }, 'home')).toBe('stack')
    expect(readLayoutPreset({ pageLayouts: { home: 'bogus' } }, 'home')).toBe(DEFAULT_LAYOUT_PRESET)
  })

  it('reads a per-page preset and is immutable on write', () => {
    const prefs = { coverSize: 'hero' }
    const next = withLayoutPreset(prefs, 'home', 'main-rail')
    expect(readLayoutPreset(next, 'home')).toBe('main-rail')
    expect(readLayoutPreset(next, 'classes')).toBe('stack') // other pages unaffected
    expect((next as { coverSize?: string }).coverSize).toBe('hero') // siblings preserved
    expect('pageLayouts' in prefs).toBe(false) // input untouched
  })

  it('clears the entry (and the map) when set back to the default', () => {
    const prefs = withLayoutPreset({}, 'home', 'sections')
    expect('pageLayouts' in prefs).toBe(true)
    const cleared = withLayoutPreset(prefs, 'home', 'stack')
    expect('pageLayouts' in cleared).toBe(false)
  })

  it('never writes a prototype-pollution / non-slug key (security guard)', () => {
    for (const bad of ['__proto__', 'constructor', 'prototype', 'has space', 'Home', 'trailing-']) {
      const next = withLayoutPreset({}, bad, 'main-rail')
      // No pageLayouts written for a hostile / invalid key, and the prototype is never touched.
      expect('pageLayouts' in next).toBe(false)
      expect((({}) as Record<string, unknown>).polluted).toBeUndefined()
      // Reading a hostile key falls back to the default, never a walked prototype value.
      expect(readLayoutPreset(next, bad)).toBe('stack')
    }
    // A valid kebab slug still writes normally.
    expect(readLayoutPreset(withLayoutPreset({}, 'about-us', 'sections'), 'about-us')).toBe('sections')
  })
})

describe('applyLayoutPreset (pure display transform)', () => {
  it('leaves the content flat for stack + sections', () => {
    expect(applyLayoutPreset(flat, 'stack')).toEqual(flat)
    expect(applyLayoutPreset(flat, 'sections')).toEqual(flat)
  })

  it('partitions into a SpaceLayout main + side rail for main-rail', () => {
    const arranged = applyLayoutPreset(flat, 'main-rail')
    expect(arranged.content).toHaveLength(1)
    const layout = arranged.content[0] as { type: string; props: { main: { type: string }[]; side: { type: string }[] } }
    expect(layout.type).toBe('SpaceLayout')
    // fact cards -> side; everything else -> main, each in original order
    expect(layout.props.main.map((b) => b.type)).toEqual(['SpaceOfferings', 'SpaceBooking'])
    expect(layout.props.side.map((b) => b.type)).toEqual(['SpaceHighlights', 'SpaceContact', 'SpaceBusiness'])
    // the input doc is untouched (content is not mutated in storage)
    expect(flat.content).toHaveLength(5)
  })

  it('keeps the flat list when nothing is rail-worthy', () => {
    const mainOnly = { root: {}, content: [{ type: 'SpaceOfferings', props: {} }, { type: 'SpaceBooking', props: {} }] } as unknown as Data
    expect(applyLayoutPreset(mainOnly, 'main-rail')).toEqual(mainOnly)
  })

  it('respects an explicit SpaceLayout the operator already placed', () => {
    const withLayout = { root: {}, content: [{ type: 'SpaceLayout', props: { main: [], side: [] } }] } as unknown as Data
    expect(applyLayoutPreset(withLayout, 'main-rail')).toEqual(withLayout)
  })

  it('tolerates a malformed doc', () => {
    const junk = { root: {}, content: 'nope' } as unknown as Data
    expect(applyLayoutPreset(junk, 'main-rail')).toEqual(junk)
  })
})
