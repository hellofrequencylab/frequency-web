import { describe, expect, it } from 'vitest'
import { RANK_ORDER, rankIndex, higherRank, rankForCompletion } from './season-ranks'

describe('rank ordering', () => {
  it('orders ascending: ghost < initiate < adept < master', () => {
    expect(RANK_ORDER).toEqual(['ghost', 'initiate', 'adept', 'master'])
    expect(rankIndex('ghost')).toBe(0)
    expect(rankIndex('master')).toBe(3)
    expect(rankIndex('adept')).toBeGreaterThan(rankIndex('initiate'))
  })

  it('treats unknown/null as ghost (the floor)', () => {
    expect(rankIndex(null)).toBe(0)
    expect(rankIndex(undefined)).toBe(0)
    expect(rankIndex('nonsense')).toBe(0)
  })
})

describe('higherRank (the lifetime-peak rule)', () => {
  it('returns the higher of two ranks, regardless of order', () => {
    expect(higherRank('initiate', 'adept')).toBe('adept')
    expect(higherRank('adept', 'initiate')).toBe('adept')
    expect(higherRank('ghost', 'ghost')).toBe('ghost')
    expect(higherRank('master', 'adept')).toBe('master')
  })

  it('never lowers a peak when the new rank is null/ghost', () => {
    expect(higherRank('adept', null)).toBe('adept')
    expect(higherRank('adept', 'ghost')).toBe('adept')
  })
})

describe('rankForCompletion thresholds', () => {
  it('maps journey completion counts to the earned rank', () => {
    expect(rankForCompletion(0)).toBe('ghost')
    expect(rankForCompletion(1)).toBe('initiate')
    expect(rankForCompletion(2)).toBe('adept')
    expect(rankForCompletion(3)).toBe('master')
    expect(rankForCompletion(10)).toBe('master')
  })
})
