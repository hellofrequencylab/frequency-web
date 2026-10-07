import { describe, expect, it } from 'vitest'
import { siteCardHref } from './spotlight-site'

const site = { appOrigin: 'https://frequencylocal.com', book: 'https://danieltyack.com/book', contact: null }

describe('siteCardHref (LIVE-855)', () => {
  it('keeps the app path off a website host', () => {
    expect(siteCardHref('product:1', '/market/1', null)).toEqual({ href: '/market/1', onFrequency: false })
  })

  it("books on the site's own Book page", () => {
    expect(siteCardHref('book', '/spaces/danieltyack/book', site)).toEqual({ href: 'https://danieltyack.com/book', onFrequency: false })
  })

  it('sends a card the site cannot serve to Frequency, labeled', () => {
    expect(siteCardHref('contact', '/spaces/danieltyack/contact', site)).toEqual({
      href: 'https://frequencylocal.com/spaces/danieltyack/contact',
      onFrequency: true,
    })
    expect(siteCardHref('journey:a', '/journeys/a', site)).toEqual({ href: 'https://frequencylocal.com/journeys/a', onFrequency: true })
  })
})
