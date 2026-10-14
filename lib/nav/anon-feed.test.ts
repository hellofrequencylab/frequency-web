import { describe, expect, it } from 'vitest'
import { anonFeedRoute, isAnonShellFeed } from '@/lib/nav/anon-feed'

// SCAN-889 (owner, 2026-10-14): a signed-out /feed under Frequency is the real Feed in the member shell,
// as Anonymous; DAWN keeps the public preview; members and every other path are untouched.
describe('the signed-out Feed rule', () => {
  it('lets a signed-out Frequency visitor through to the member shell', () => {
    expect(anonFeedRoute({ pathname: '/feed', signedIn: false, design: 'frequency' })).toBe('shell')
    expect(isAnonShellFeed('/feed', 'frequency')).toBe(true)
  })

  it('keeps the DAWN preview rewrite', () => {
    expect(anonFeedRoute({ pathname: '/feed', signedIn: false, design: 'dawn' })).toBe('preview')
    expect(isAnonShellFeed('/feed', 'dawn')).toBe(false)
  })

  it('leaves a member, and every deeper Feed path, to the ordinary rules', () => {
    expect(anonFeedRoute({ pathname: '/feed', signedIn: true, design: 'frequency' })).toBeNull()
    expect(anonFeedRoute({ pathname: '/feed/abc', signedIn: false, design: 'frequency' })).toBeNull()
    expect(anonFeedRoute({ pathname: '/messages', signedIn: false, design: 'frequency' })).toBeNull()
    expect(isAnonShellFeed('/feed/abc', 'frequency')).toBe(false)
    expect(isAnonShellFeed(null, 'frequency')).toBe(false)
  })
})
