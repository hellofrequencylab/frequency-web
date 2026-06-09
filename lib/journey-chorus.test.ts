import { describe, it, expect } from 'vitest'
import {
  detectChoruses,
  chorusBonusQualifies,
  chorusKey,
  CHORUS_MIN_MEMBERS,
} from '@/lib/journey-chorus'

describe('detectChoruses', () => {
  it('forms a Chorus when ≥3 circle members share an active adoption', () => {
    const members = new Map([['circle-1', ['a', 'b', 'c', 'd']]])
    const adopters = new Map([['plan-1', new Set(['a', 'b', 'c'])]])
    const out = detectChoruses(members, adopters)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ circleId: 'circle-1', planId: 'plan-1' })
    expect([...out[0].memberIds].sort()).toEqual(['a', 'b', 'c'])
  })
  it('does not form a Chorus below the threshold', () => {
    const members = new Map([['circle-1', ['a', 'b', 'c']]])
    const adopters = new Map([['plan-1', new Set(['a', 'b'])]])
    expect(detectChoruses(members, adopters)).toEqual([])
  })
  it('counts only members who are BOTH in the circle and adopters', () => {
    const members = new Map([['circle-1', ['a', 'b']]]) // c, d are adopters but not in the circle
    const adopters = new Map([['plan-1', new Set(['a', 'b', 'c', 'd'])]])
    expect(detectChoruses(members, adopters)).toEqual([])
  })
  it('finds multiple Choruses across circles and plans', () => {
    const members = new Map([
      ['circle-1', ['a', 'b', 'c']],
      ['circle-2', ['d', 'e', 'f']],
    ])
    const adopters = new Map([
      ['plan-1', new Set(['a', 'b', 'c'])],
      ['plan-2', new Set(['d', 'e', 'f'])],
    ])
    expect(detectChoruses(members, adopters)).toHaveLength(2)
  })
})

describe('chorusBonusQualifies', () => {
  it('needs ≥ CHORUS_MIN_MEMBERS in rhythm', () => {
    expect(chorusBonusQualifies(CHORUS_MIN_MEMBERS)).toBe(true)
    expect(chorusBonusQualifies(CHORUS_MIN_MEMBERS - 1)).toBe(false)
    expect(CHORUS_MIN_MEMBERS).toBe(3)
  })
})

describe('chorusKey', () => {
  it('is stable and unique per circle/plan/season/bucket', () => {
    expect(chorusKey('c', 'p', 1, 0)).toBe('journey.chorus:c:p:1:0')
  })
})
