import { describe, it, expect } from 'vitest'
import { isWellFormed, isFullyKnown, unknownTypes } from '@/lib/page-editor/templates'

const withUnknown = { root: {}, content: [
  { type: 'Heading', props: { id: 'a', text: 'Hi' } },
  { type: 'ZigZag', props: { id: 'b', title: 'Retired' } },
] }

describe('unknown-block preservation (ADR-978)', () => {
  it('keeps a document that carries a retired type', () => {
    expect(isWellFormed(withUnknown)).toBe(true)
  })
  it('still reports it as not fully known', () => {
    expect(isFullyKnown(withUnknown)).toBe(false)
  })
  it('names the unresolvable types', () => {
    expect(unknownTypes(withUnknown)).toEqual(['ZigZag'])
  })
  it('rejects a genuinely malformed document', () => {
    expect(isWellFormed({ root: {}, content: [{ props: { id: 'a' } }] })).toBe(false)
    expect(isWellFormed({ root: {}, content: [] })).toBe(false)
    expect(isWellFormed(null)).toBe(false)
  })
  it('the five real orphan types are all detected', () => {
    const doc = { root: {}, content: ['ZigZag','PageHero','ImageBand','BetaCTA','FeatureGallery']
      .map((type, i) => ({ type, props: { id: `n${i}` } })) }
    expect(isWellFormed(doc)).toBe(true)
    expect(unknownTypes(doc)).toHaveLength(5)
  })
})
