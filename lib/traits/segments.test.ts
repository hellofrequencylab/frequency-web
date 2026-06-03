import { describe, it, expect } from 'vitest'
import {
  evaluateSegment,
  validateSegmentDefinition,
  describeSegment,
  type MemberSnapshot,
  type SegmentDefinition,
} from './segments'

const member = (tags: string[], traits: Record<string, number | string | boolean>): MemberSnapshot => ({
  profileId: 'p1',
  tags: new Set(tags),
  traits: new Map(Object.entries(traits)),
})

describe('evaluateSegment', () => {
  const betaActive: SegmentDefinition = {
    combinator: 'all',
    predicates: [
      { type: 'tag', key: 'web_beta' },
      { type: 'trait', key: 'wam_status', op: 'eq', value: true },
    ],
  }

  it('all — every predicate must match', () => {
    expect(evaluateSegment(betaActive, member(['web_beta'], { wam_status: true }))).toBe(true)
    expect(evaluateSegment(betaActive, member(['web_beta'], { wam_status: false }))).toBe(false)
    expect(evaluateSegment(betaActive, member([], { wam_status: true }))).toBe(false)
  })

  it('any — one predicate is enough', () => {
    const def: SegmentDefinition = { combinator: 'any', predicates: betaActive.predicates }
    expect(evaluateSegment(def, member([], { wam_status: true }))).toBe(true)
    expect(evaluateSegment(def, member([], { wam_status: false }))).toBe(false)
  })

  it('numeric ops', () => {
    const def: SegmentDefinition = { combinator: 'all', predicates: [{ type: 'trait', key: 'rfm_score', op: 'gte', value: 40 }] }
    expect(evaluateSegment(def, member([], { rfm_score: 52 }))).toBe(true)
    expect(evaluateSegment(def, member([], { rfm_score: 21 }))).toBe(false)
  })

  it('missing trait and empty predicates match nobody', () => {
    expect(evaluateSegment({ combinator: 'all', predicates: [{ type: 'trait', key: 'wam_status', op: 'eq', value: true }] }, member([], {}))).toBe(false)
    expect(evaluateSegment({ combinator: 'all', predicates: [] }, member(['web_beta'], {}))).toBe(false)
  })
})

describe('validateSegmentDefinition', () => {
  it('accepts a registry-valid definition', () => {
    expect(validateSegmentDefinition({ combinator: 'all', predicates: [{ type: 'tag', key: 'web_beta' }] })).toEqual([])
  })

  it('rejects unknown keys, mismatched kinds, bad ops, bad combinator, empty', () => {
    expect(validateSegmentDefinition({ combinator: 'all', predicates: [{ type: 'tag', key: 'nope' }] })).toHaveLength(1)
    // a computed-trait key used as a tag
    expect(validateSegmentDefinition({ combinator: 'all', predicates: [{ type: 'tag', key: 'wam_status' }] })).toHaveLength(1)
    // a tag key used as a trait
    expect(validateSegmentDefinition({ combinator: 'all', predicates: [{ type: 'trait', key: 'web_beta', op: 'eq', value: true }] })).toHaveLength(1)
    expect(validateSegmentDefinition({ combinator: 'all', predicates: [{ type: 'trait', key: 'wam_status', op: 'bogus', value: true }] })).toHaveLength(1)
    expect(validateSegmentDefinition({ combinator: 'sometimes', predicates: [{ type: 'tag', key: 'web_beta' }] })).toHaveLength(1)
    expect(validateSegmentDefinition({ combinator: 'all', predicates: [] })).toHaveLength(1)
  })
})

describe('describeSegment', () => {
  it('renders a human summary with registry labels', () => {
    const s = describeSegment({
      combinator: 'all',
      predicates: [{ type: 'tag', key: 'web_beta' }, { type: 'trait', key: 'wam_status', op: 'eq', value: true }],
    })
    expect(s).toBe('has “Web Beta” AND WAM status = true')
  })
})
