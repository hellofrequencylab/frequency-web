import { describe, it, expect } from 'vitest'
import { scoreResult, rankResults, orderByRelevance, contextualEntrySlot } from './rail-intel'

describe('scoreResult (ADR-516 Phase E — search-result scoring)', () => {
  it('ranks exact > prefix > bare match, so what you typed wins', () => {
    expect(scoreResult('billing', 'Billing')).toBeGreaterThan(scoreResult('bill', 'Billing'))
    // a bare subsequence match (no prefix) scores only the base 0 here
    expect(scoreResult('bill', 'Billing')).toBeGreaterThan(scoreResult('b', 'About you'))
  })

  it('adds an on-page boost above an incomplete boost above the base, all below a label match', () => {
    const onPage = scoreResult('x', 'Zzz', { onPage: true })
    const incomplete = scoreResult('x', 'Zzz', { incomplete: true })
    expect(onPage).toBeGreaterThan(incomplete)
    expect(incomplete).toBeGreaterThan(scoreResult('x', 'Zzz'))
    // a prefix label match still outranks an on-page-only result (typed intent wins over location)
    expect(scoreResult('bil', 'Billing')).toBeGreaterThan(onPage)
  })

  it('is 0 with no query and no signals (fail-safe base)', () => {
    expect(scoreResult('', 'Anything')).toBe(0)
  })
})

describe('rankResults', () => {
  it('sorts by score DESC, keeping input order for ties (today’s order is the tiebreak)', () => {
    const items = [
      { id: 'a', s: 0 },
      { id: 'b', s: 10 },
      { id: 'c', s: 0 },
      { id: 'd', s: 10 },
    ]
    const out = rankResults(items, (x) => x.s).map((x) => x.id)
    expect(out).toEqual(['b', 'd', 'a', 'c'])
  })

  it('returns an all-zero set unchanged (fail-safe)', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(rankResults(items, () => 0).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('orderByRelevance (ADR-516 Phase E — completeness-based ordering)', () => {
  const secs = [{ slot: 'basics' }, { slot: 'account' }, { slot: 'layout' }]

  it('floats an incomplete section to the top, keeping the rest in place', () => {
    const out = orderByRelevance(secs, (s) => s.slot === 'account')
    expect(out.map((s) => s.slot)).toEqual(['account', 'basics', 'layout'])
  })

  it('is a no-op when nothing is incomplete (fail-safe → today’s order)', () => {
    const out = orderByRelevance(secs, () => false)
    expect(out.map((s) => s.slot)).toEqual(['basics', 'account', 'layout'])
  })

  it('is stable across several incomplete sections (band order is the tiebreak)', () => {
    const many = [{ slot: 'a' }, { slot: 'b' }, { slot: 'c' }, { slot: 'd' }]
    const out = orderByRelevance(many, (s) => s.slot === 'b' || s.slot === 'd')
    expect(out.map((s) => s.slot)).toEqual(['b', 'd', 'a', 'c'])
  })
})

describe('contextualEntrySlot', () => {
  it('lands the profile builder on Layout and every other archetype at the top', () => {
    expect(contextualEntrySlot('builder')).toBe('layout')
    expect(contextualEntrySlot('hub')).toBeNull()
    expect(contextualEntrySlot('manage')).toBeNull()
  })
})
