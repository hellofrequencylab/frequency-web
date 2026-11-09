import { describe, expect, it } from 'vitest'
import { railInit, railModes, railPrefs, railReducer, RAIL_WIDTH, type RailState } from './rails'

const WIDTHS = [1600, 1200, 900, 700, 390] as const
const pinned = railInit()
const unpinned = railInit({ leftPinned: false, rightPinned: false })

describe('railModes: every state at every width (BLD-102)', () => {
  // [width, both pinned, neither pinned, neither pinned with the outline open, focus]
  const table: [number, string, string, string, string][] = [
    [1600, 'pinned/pinned', 'strip/strip', 'overlay/strip', 'hidden/hidden'],
    [1200, 'pinned/pinned', 'strip/strip', 'overlay/strip', 'hidden/hidden'],
    [900, 'strip/pinned', 'strip/strip', 'overlay/strip', 'hidden/hidden'],
    [700, 'strip/strip', 'strip/strip', 'overlay/strip', 'hidden/hidden'],
    [390, 'hidden/hidden', 'hidden/hidden', 'overlay/hidden', 'hidden/hidden'],
  ]
  const show = (s: RailState, w: number) => { const m = railModes(s, w); return `${m.left}/${m.right}` }
  it.each(table)('at %ipx', (w, both, neither, open, focus) => {
    expect(show(pinned, w)).toBe(both)
    expect(show(unpinned, w)).toBe(neither)
    expect(show(railReducer(unpinned, { type: 'toggle', side: 'left', width: w }), w)).toBe(open)
    expect(show(railReducer(pinned, { type: 'focus', on: true }), w)).toBe(focus)
  })
  it('covers the five widths the spec names', () => expect(table.map((r) => r[0])).toEqual([...WIDTHS]))
})

describe('railReducer', () => {
  it('opens an overlay and remembers the trigger, and Esc or a canvas click closes it', () => {
    const open = railReducer(unpinned, { type: 'toggle', side: 'right', width: 700, trigger: 'rail-right' })
    expect(open.open).toBe('right')
    expect(open.trigger).toBe('rail-right')
    const closed = railReducer(open, { type: 'close' })
    expect(closed.open).toBeNull()
    expect(closed.trigger).toBe('rail-right')
  })
  it('a pinned rail toggles to unpinned; pinning an open overlay closes the overlay', () => {
    expect(railReducer(pinned, { type: 'toggle', side: 'left', width: 1600 }).prefs.leftPinned).toBe(false)
    const open = railReducer(unpinned, { type: 'toggle', side: 'right', width: 1600 })
    const pin = railReducer(open, { type: 'pin', side: 'right', pinned: true })
    expect(pin.open).toBeNull()
    expect(railModes(pin, 1600).right).toBe('pinned')
  })
  it('focus mode closes any overlay and hides both rails; leaving it restores the pins', () => {
    const f = railReducer(railReducer(unpinned, { type: 'toggle', side: 'left', width: 700 }), { type: 'focus', on: true })
    expect(f.open).toBeNull()
    expect(railModes(railReducer(railReducer(pinned, { type: 'focus', on: true }), { type: 'focus', on: false }), 1600)).toEqual({ left: 'pinned', right: 'pinned' })
  })
  it('keeps the right rail between 300 and 420', () => {
    expect(railReducer(pinned, { type: 'resize', width: 900 }).prefs.rightWidth).toBe(RAIL_WIDTH.max)
    expect(railReducer(pinned, { type: 'resize', width: 10 }).prefs.rightWidth).toBe(RAIL_WIDTH.min)
  })
})

describe('railPrefs', () => {
  it('falls back field by field on a bad stored value', () => {
    expect(railPrefs(null)).toEqual({ leftPinned: true, rightPinned: true, rightWidth: 320 })
    expect(railPrefs({ leftPinned: 'yes', rightPinned: false, rightWidth: 'wide' })).toEqual({ leftPinned: true, rightPinned: false, rightWidth: 320 })
  })
})
