import { describe, expect, it } from 'vitest'
import type { RowDef } from './layout'
import { canMoveBoxDown, canMoveBoxUp, findBoxPosition } from './box-position'

// Unit test for the on-page editor's pure box-position helpers (ADR-542). Covers the stack-index math the
// per-box move up/down controls rely on: top box cannot move up, bottom box cannot move down, and an
// unplaced id is a clean null / false.

const rows: RowDef[] = [
  { id: 'r0', columns: 1, cells: [['about', 'story']] },
  { id: 'r1', columns: 2, cells: [['offerings'], ['reviews', 'contact', 'team']] },
]

describe('findBoxPosition', () => {
  it('locates a box by row, column, and stack index', () => {
    expect(findBoxPosition(rows, 'about')).toEqual({ rowId: 'r0', col: 0, index: 0, stackLength: 2 })
    expect(findBoxPosition(rows, 'story')).toEqual({ rowId: 'r0', col: 0, index: 1, stackLength: 2 })
    expect(findBoxPosition(rows, 'contact')).toEqual({ rowId: 'r1', col: 1, index: 1, stackLength: 3 })
  })

  it('returns null for an unplaced id', () => {
    expect(findBoxPosition(rows, 'events')).toBeNull()
  })
})

describe('canMoveBoxUp / canMoveBoxDown', () => {
  it('disables up at the top of a stack and down at the bottom', () => {
    expect(canMoveBoxUp(rows, 'about')).toBe(false)
    expect(canMoveBoxDown(rows, 'about')).toBe(true)
    expect(canMoveBoxUp(rows, 'story')).toBe(true)
    expect(canMoveBoxDown(rows, 'story')).toBe(false)
  })

  it('handles a mid-stack box (can move both ways)', () => {
    expect(canMoveBoxUp(rows, 'contact')).toBe(true)
    expect(canMoveBoxDown(rows, 'contact')).toBe(true)
  })

  it('is false both ways for a single-box column', () => {
    expect(canMoveBoxUp(rows, 'offerings')).toBe(false)
    expect(canMoveBoxDown(rows, 'offerings')).toBe(false)
  })

  it('is false for an unplaced id', () => {
    expect(canMoveBoxUp(rows, 'events')).toBe(false)
    expect(canMoveBoxDown(rows, 'events')).toBe(false)
  })
})
