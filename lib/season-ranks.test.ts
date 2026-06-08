import { describe, expect, it } from 'vitest'
import { RANK_ORDER, rankIndex, higherRank, rankForZaps } from './season-ranks'

describe('rank ordering', () => {
  it('orders ascending: ghost < runner < operative < agent < conduit < luminary', () => {
    expect(RANK_ORDER).toEqual(['ghost', 'runner', 'operative', 'agent', 'conduit', 'luminary'])
    expect(rankIndex('ghost')).toBe(0)
    expect(rankIndex('luminary')).toBe(5)
    expect(rankIndex('agent')).toBeGreaterThan(rankIndex('operative'))
  })

  it('treats unknown/null as ghost (the floor)', () => {
    expect(rankIndex(null)).toBe(0)
    expect(rankIndex(undefined)).toBe(0)
    expect(rankIndex('nonsense')).toBe(0)
  })
})

describe('higherRank (the lifetime-peak rule)', () => {
  it('returns the higher of two ranks, regardless of order', () => {
    expect(higherRank('runner', 'agent')).toBe('agent')
    expect(higherRank('agent', 'runner')).toBe('agent')
    expect(higherRank('ghost', 'ghost')).toBe('ghost')
    expect(higherRank('luminary', 'conduit')).toBe('luminary')
  })

  it('never lowers a peak when the new rank is null/ghost', () => {
    expect(higherRank('conduit', null)).toBe('conduit')
    expect(higherRank('conduit', 'ghost')).toBe('conduit')
  })
})

describe('rankForZaps thresholds', () => {
  it('maps zap totals to the earned rank', () => {
    expect(rankForZaps(0)).toBe('ghost')
    expect(rankForZaps(99)).toBe('ghost')
    expect(rankForZaps(100)).toBe('runner')
    expect(rankForZaps(750)).toBe('agent')
    expect(rankForZaps(3000)).toBe('luminary')
  })
})
