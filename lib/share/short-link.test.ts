import { describe, expect, it } from 'vitest'
import { isPreviewFetcher, isShareSlug, shortenablePath, shortLinkFor } from './short-link'

describe('shortenablePath', () => {
  it('accepts public entity pages, with or without an origin, query or trailing slash', () => {
    expect(shortenablePath('/events/summer-sound')).toBe('/events/summer-sound')
    expect(shortenablePath('https://frequencylocal.com/spaces/the-group?x=1#top')).toBe('/spaces/the-group')
    expect(shortenablePath('/people/dana/')).toBe('/people/dana')
    expect(shortenablePath('/')).toBe('/')
  })
  it('refuses owner, admin and feed routes and anything that would collapse', () => {
    for (const p of ['/events/x/manage', '/spaces/x/settings', '/admin/qr', '/feed', '/events/x/edit', '/people/x/anything']) {
      expect(shortenablePath(p)).toBeNull()
    }
  })
  it('refuses off-site shapes and junk', () => {
    for (const p of ['//evil.com', '/\\evil.com', 'javascript:alert(1)', '', 'events/x']) {
      expect(shortenablePath(p)).toBeNull()
    }
  })
})

describe('shortLinkFor and isShareSlug', () => {
  it('builds /s/<slug> without a double slash', () => {
    expect(shortLinkFor('https://frequencylocal.com/', 'x7k2mab')).toBe('https://frequencylocal.com/s/x7k2mab')
  })
  it('accepts the slug shape and rejects the rest', () => {
    expect(isShareSlug('x7k2mab')).toBe(true)
    for (const s of ['ab', 'UP', 'a/b', '../x', null, 4]) expect(isShareSlug(s)).toBe(false)
  })
})

describe('isPreviewFetcher', () => {
  it('does not count crawlers, unfurlers or an absent agent', () => {
    expect(isPreviewFetcher(null)).toBe(true)
    expect(isPreviewFetcher('facebookexternalhit/1.1')).toBe(true)
    expect(isPreviewFetcher('Slackbot-LinkExpanding 1.0')).toBe(true)
    expect(isPreviewFetcher('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1')).toBe(false)
  })
})
