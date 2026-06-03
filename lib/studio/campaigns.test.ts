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
})
