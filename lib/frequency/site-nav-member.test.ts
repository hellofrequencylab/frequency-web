import { describe, expect, it } from 'vitest'
import { ROUTES, memberFeedLink, siteLogoHref } from '@/lib/frequency/site-nav'

describe('the website header for a signed-in member', () => {
  it('sends the logo to the feed only when signed in', () => {
    expect(siteLogoHref(true)).toBe(ROUTES.feed)
    expect(siteLogoHref(false)).toBe(ROUTES.home)
  })

  it('leads the nav with Feed only when signed in', () => {
    expect(memberFeedLink(true)).toEqual({ href: '/feed', label: 'Feed' })
    expect(memberFeedLink(false)).toBeNull()
  })
})
