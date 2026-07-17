import { describe, it, expect } from 'vitest'
import {
  evaluateSegment,
  validateSegmentDefinition,
  describeSegment,
  uniqueSegmentSlug,
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

  it('rejects a value whose type does not match the trait type (would silently never match)', () => {
    // rfm_score is a `number` trait. A string '40' passes the scalar check but compares as `40 === '40'`
    // (false) at eval time, so the segment silently matches nobody. The validator must reject it.
    expect(
      validateSegmentDefinition({ combinator: 'all', predicates: [{ type: 'trait', key: 'rfm_score', op: 'eq', value: '40' }] }),
    ).toHaveLength(1)
    // The correctly-typed number is accepted.
    expect(
      validateSegmentDefinition({ combinator: 'all', predicates: [{ type: 'trait', key: 'rfm_score', op: 'eq', value: 40 }] }),
    ).toEqual([])
    // A boolean trait (wam_status) rejects a string, accepts a boolean.
    expect(
      validateSegmentDefinition({ combinator: 'all', predicates: [{ type: 'trait', key: 'wam_status', op: 'eq', value: 'true' }] }),
    ).toHaveLength(1)
    expect(
      validateSegmentDefinition({ combinator: 'all', predicates: [{ type: 'trait', key: 'wam_status', op: 'eq', value: true }] }),
    ).toEqual([])
    // An enum trait (lifecycle_stage) compares as a string, so a string value is accepted.
    expect(
      validateSegmentDefinition({ combinator: 'all', predicates: [{ type: 'trait', key: 'lifecycle_stage', op: 'eq', value: 'dormant' }] }),
    ).toEqual([])
  })
})

describe('uniqueSegmentSlug', () => {
  it('slugifies the name when free', () => {
    expect(uniqueSegmentSlug('Active Founders', [])).toBe('active-founders')
  })

  it('appends a numeric suffix on collision, skipping taken suffixes', () => {
    expect(uniqueSegmentSlug('Active Founders', ['active-founders'])).toBe('active-founders-2')
    expect(uniqueSegmentSlug('Active Founders', ['active-founders', 'active-founders-2'])).toBe('active-founders-3')
  })

  it('ignores the row’s own current slug so an unchanged name keeps it', () => {
    expect(uniqueSegmentSlug('Active Founders', ['active-founders'], 'active-founders')).toBe('active-founders')
  })

  it('falls back to "segment" when the name has no slug-able characters', () => {
    expect(uniqueSegmentSlug('!!!', [])).toBe('segment')
    expect(uniqueSegmentSlug('!!!', ['segment'])).toBe('segment-2')
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
