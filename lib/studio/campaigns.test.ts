import { describe, it, expect } from 'vitest'
import { parseSegmentKey, TRAIT_SEGMENT_PREFIX } from './campaigns'

describe('parseSegmentKey', () => {
  it('treats unprefixed keys as built-in audiences', () => {
    expect(parseSegmentKey('members')).toEqual({ kind: 'builtin', slug: 'members' })
    expect(parseSegmentKey('subscribed_members')).toEqual({ kind: 'builtin', slug: 'subscribed_members' })
  })

  it('unwraps trait-segment keys', () => {
    expect(parseSegmentKey(`${TRAIT_SEGMENT_PREFIX}web-beta`)).toEqual({ kind: 'trait', slug: 'web-beta' })
    expect(parseSegmentKey('seg:web-beta-active')).toEqual({ kind: 'trait', slug: 'web-beta-active' })
  })

  it('classifies place-tree selectors (CRM Phase 5 — one audience type, both worlds)', () => {
    expect(parseSegmentKey('circle:abc')).toEqual({ kind: 'place', place: 'circle', id: 'abc' })
    expect(parseSegmentKey('hub:h1')).toEqual({ kind: 'place', place: 'hub', id: 'h1' })
    expect(parseSegmentKey('nexus:n1')).toEqual({ kind: 'place', place: 'nexus', id: 'n1' })
    // A bare prefix is NOT a place selector — it falls through to a built-in (never an unbounded place).
    expect(parseSegmentKey('circle:')).toEqual({ kind: 'builtin', slug: 'circle:' })
  })
})
