import { describe, expect, it } from 'vitest'
import { BOARD_TABS, parseBoardTab } from './around-you-board'

describe('parseBoardTab', () => {
  it('defaults to events', () => {
    expect(parseBoardTab(undefined, false)).toBe('events')
  })
  it('opens Dispatches when composing', () => {
    expect(parseBoardTab(undefined, true)).toBe('dispatches')
  })
  it('accepts every known tab and rejects unknown ones', () => {
    for (const t of BOARD_TABS) expect(parseBoardTab(t, false)).toBe(t)
    expect(parseBoardTab('admin', false)).toBe('events')
    expect(parseBoardTab('__proto__', true)).toBe('dispatches')
  })
})
