import { describe, it, expect } from 'vitest'
import { parseSegmentKey, TRAIT_SEGMENT_PREFIX } from './campaigns'

describe('parseSegmentKey', () => {
  it('treats unprefixed keys as built-in audiences', () => {
    expect(parseSegmentKey('members')).toEqual({ kind: 'builtin', slug: 'members' })
    expect(parseSegmentKey('subscribed_members')).toEqual({ kind: 'builtin', slug: 'subscribed_members' })
    // Site sign-ups (organic members, imported list held out by source) is a built-in.
    expect(parseSegmentKey('site_signups')).toEqual({ kind: 'builtin', slug: 'site_signups' })
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

  it('classifies a single member / contact selector (Resonance CRM composer)', () => {
    expect(parseSegmentKey('profile:p1')).toEqual({ kind: 'profiles', ids: ['p1'] })
    expect(parseSegmentKey('contact:k1')).toEqual({ kind: 'contacts', ids: ['k1'] })
  })

  it('classifies an ad-hoc member / contact set, trimming, de-duplicating, dropping empties', () => {
    expect(parseSegmentKey('profiles:p1,p2,p3')).toEqual({ kind: 'profiles', ids: ['p1', 'p2', 'p3'] })
    expect(parseSegmentKey('profiles: p1 , p2 ,, p1 ')).toEqual({ kind: 'profiles', ids: ['p1', 'p2'] })
    expect(parseSegmentKey('contacts:k1,k2')).toEqual({ kind: 'contacts', ids: ['k1', 'k2'] })
    // The plural form never collides with the singular (the `s` precedes the colon).
    expect(parseSegmentKey('profiles:p1')).toEqual({ kind: 'profiles', ids: ['p1'] })
  })

  it('classifies an event RSVP audience', () => {
    expect(parseSegmentKey('event:ev1')).toEqual({ kind: 'event', id: 'ev1' })
  })

  it('reads a bare CRM prefix as an EMPTY audience of that kind, never a built-in (fail-safe: nobody)', () => {
    expect(parseSegmentKey('profile:')).toEqual({ kind: 'profiles', ids: [] })
    expect(parseSegmentKey('profiles:')).toEqual({ kind: 'profiles', ids: [] })
    expect(parseSegmentKey('contact:')).toEqual({ kind: 'contacts', ids: [] })
    expect(parseSegmentKey('event:')).toEqual({ kind: 'event', id: '' })
  })
})
