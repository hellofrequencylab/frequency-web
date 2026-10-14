import { describe, expect, it } from 'vitest'
import { ROUTES, feedHomeLink, siteLogoHref } from '@/lib/frequency/site-nav'

describe('the website header for a signed-in member', () => {
  it('sends the logo to the feed only when signed in', () => {
    expect(siteLogoHref(true)).toBe(ROUTES.feed)
    expect(siteLogoHref(false)).toBe(ROUTES.home)
  })
})

describe('the header\'s first item (owner, 2026-10-14)', () => {
  it('reads Feed for everyone, signed in or out, off the Feed', () => {
    expect(feedHomeLink('/', false)).toEqual({ href: '/feed', label: 'Feed' })
    expect(feedHomeLink('/pricing', true)).toEqual({ href: '/feed', label: 'Feed' })
  })

  it('reads Home on the Feed, to the home page', () => {
    expect(feedHomeLink('/feed', false)).toEqual({ href: '/', label: 'Home' })
    // A member's Home goes past the front door, which would otherwise send them back to the Feed.
    expect(feedHomeLink('/feed', true)).toEqual({ href: '/?home', label: 'Home' })
  })
})
