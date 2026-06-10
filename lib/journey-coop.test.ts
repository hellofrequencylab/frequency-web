import { describe, it, expect } from 'vitest'
import {
  detectCoops,
  coopBonusQualifies,
  coopKey,
  COOP_MIN_MEMBERS,
} from '@/lib/journey-coop'

describe('detectCoops', () => {
  it('forms a Co-op when ≥3 circle members share an active adoption', () => {
    const members = new Map([['circle-1', ['a', 'b', 'c', 'd']]])
    const adopters = new Map([['plan-1', new Set(['a', 'b', 'c'])]])
    const out = detectCoops(members, adopters)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ circleId: 'circle-1', planId: 'plan-1' })
    expect([...out[0].memberIds].sort()).toEqual(['a', 'b', 'c'])
  })
  it('does not form a Co-op below the threshold', () => {
    const members = new Map([['circle-1', ['a', 'b', 'c']]])
    const adopters = new Map([['plan-1', new Set(['a', 'b'])]])
    expect(detectCoops(members, adopters)).toEqual([])
  })
  it('counts only members who are BOTH in the circle and adopters', () => {
    const members = new Map([['circle-1', ['a', 'b']]]) // c, d are adopters but not in the circle
    const adopters = new Map([['plan-1', new Set(['a', 'b', 'c', 'd'])]])
    expect(detectCoops(members, adopters)).toEqual([])
  })
  it('finds multiple Co-ops across circles and plans', () => {
    const members = new Map([
      ['circle-1', ['a', 'b', 'c']],
      ['circle-2', ['d', 'e', 'f']],
    ])
    const adopters = new Map([
      ['plan-1', new Set(['a', 'b', 'c'])],
      ['plan-2', new Set(['d', 'e', 'f'])],
    ])
    expect(detectCoops(members, adopters)).toHaveLength(2)
  })
})

describe('coopBonusQualifies', () => {
  it('needs ≥ COOP_MIN_MEMBERS in rhythm', () => {
    expect(coopBonusQualifies(COOP_MIN_MEMBERS)).toBe(true)
    expect(coopBonusQualifies(COOP_MIN_MEMBERS - 1)).toBe(false)
    expect(COOP_MIN_MEMBERS).toBe(3)
  })
})

describe('coopKey', () => {
  it('is stable and unique per circle/plan/season/bucket', () => {
    expect(coopKey('c', 'p', 1, 0)).toBe('journey.chorus:c:p:1:0')
  })
})
