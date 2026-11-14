import { describe, expect, it } from 'vitest'
import { dropIndex, keyboardMove, longPressStep, LONG_PRESS_MS, reorder } from './gesture'

const LONG_PRESS_SLOP = 10
const down = longPressStep({ phase: 'idle' }, { type: 'down', x: 10, y: 10, at: 0 })

describe('long press', () => {
  it('arms after holding still for the delay', () => {
    expect(down.phase).toBe('pending')
    expect(longPressStep(down, { type: 'tick', at: LONG_PRESS_MS - 1 }).phase).toBe('pending')
    expect(longPressStep(down, { type: 'tick', at: LONG_PRESS_MS }).phase).toBe('armed')
  })
  it('tolerates finger drift inside the slop', () => {
    expect(longPressStep(down, { type: 'move', x: 10 + LONG_PRESS_SLOP, y: 10, at: 100 }).phase).toBe('pending')
  })
  it('cancels when the finger moves past the slop, so the page scrolls', () => {
    expect(longPressStep(down, { type: 'move', x: 10, y: 10 + LONG_PRESS_SLOP + 1, at: 100 }).phase).toBe('cancelled')
  })
  it('arms on a late move that is still inside the slop', () => {
    expect(longPressStep(down, { type: 'move', x: 12, y: 10, at: LONG_PRESS_MS }).phase).toBe('armed')
  })
  it('stays armed while dragging and resets on release', () => {
    const armed = { phase: 'armed' } as const
    expect(longPressStep(armed, { type: 'move', x: 500, y: 500, at: 900 })).toBe(armed)
    expect(longPressStep(armed, { type: 'up' }).phase).toBe('idle')
    expect(longPressStep({ phase: 'cancelled' }, { type: 'tick', at: 9999 }).phase).toBe('cancelled')
  })
})

describe('dropIndex and reorder', () => {
  const rows = [{ top: 0, height: 40 }, { top: 40, height: 40 }, { top: 80, height: 40 }]
  it('finds the nearest gap by row midpoints', () => {
    expect(dropIndex(rows, -5)).toBe(0)
    expect(dropIndex(rows, 19)).toBe(0)
    expect(dropIndex(rows, 21)).toBe(1)
    expect(dropIndex(rows, 70)).toBe(2)
    expect(dropIndex(rows, 999)).toBe(3)
    expect(dropIndex([], 10)).toBe(0)
  })
  it('moves an item into a gap, before or after its place', () => {
    expect(reorder(['a', 'b', 'c'], 0, 3)).toEqual(['b', 'c', 'a'])
    expect(reorder(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(reorder(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
    expect(reorder(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'b', 'c'])
    expect(reorder(['a', 'b', 'c'], 9, 0)).toEqual(['a', 'b', 'c'])
  })
})

describe('keyboardMove', () => {
  const list = ['a', 'b', 'c']
  it('moves one place or to the ends with Alt', () => {
    expect(keyboardMove(list, 1, 'ArrowUp', true)).toEqual(['b', 'a', 'c'])
    expect(keyboardMove(list, 1, 'ArrowDown', true)).toEqual(['a', 'c', 'b'])
    expect(keyboardMove(list, 2, 'Home', true)).toEqual(['c', 'a', 'b'])
    expect(keyboardMove(list, 0, 'End', true)).toEqual(['b', 'c', 'a'])
  })
  it('does nothing without Alt, at an edge, or for another key', () => {
    expect(keyboardMove(list, 1, 'ArrowUp', false)).toBeNull()
    expect(keyboardMove(list, 0, 'ArrowUp', true)).toBeNull()
    expect(keyboardMove(list, 2, 'ArrowDown', true)).toBeNull()
    expect(keyboardMove(list, 1, 'x', true)).toBeNull()
    expect(keyboardMove(list, 5, 'Home', true)).toBeNull()
  })
})
