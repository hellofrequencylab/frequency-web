import { describe, expect, it } from 'vitest'
import { countPlacedBlocks, growsPastCap } from './caps'

describe('countPlacedBlocks', () => {
  it('counts every cell in every row', () => {
    expect(countPlacedBlocks({ rows: [{ cells: [['a'], ['b', 'c']] }, { cells: [['d']] }] })).toBe(4)
  })
  it('reads anything else as none', () => {
    expect(countPlacedBlocks(null)).toBe(0)
    expect(countPlacedBlocks({ rows: 'x' })).toBe(0)
    expect(countPlacedBlocks({ rows: [{ cells: 'x' }, null] })).toBe(0)
  })
})

describe('growsPastCap', () => {
  it('refuses growth past the cap', () => expect(growsPastCap(13, 12, false)).toBe(true))
  it('allows growth inside the cap', () => expect(growsPastCap(13, 12, true)).toBe(false))
  it('never refuses a layout that did not grow (not retroactive)', () => {
    expect(growsPastCap(20, 20, false)).toBe(false)
    expect(growsPastCap(15, 20, false)).toBe(false)
  })
})
