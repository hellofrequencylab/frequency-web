import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { matchPublicTwin, hasPublicTwin, TWIN_RULES } from './public-twin'

// THE INVARIANT: a share link a member can press must not dead-end a signed-out recipient.
//
// lib/qr/public-url.ts resolves every entity share to the MEMBER url `/<prefix>/<slug>`. Six of
// the eleven prefixes it calls "public" were unreachable signed out: proxy.ts bounced three to
// /sign-in and the (main) layout bounced two to `/`. Nothing failed loudly — the share button
// worked, the link was valid, and the gates were behaving exactly as written. Only a test that
// reads BOTH the table and the two gates that consume it can hold this, so that is what this does.

const PROXY = readFileSync('proxy.ts', 'utf8')
const LAYOUT = readFileSync('app/(main)/layout.tsx', 'utf8')

describe('member detail routes redirect a signed-out visitor to their public twin', () => {
  it('both gates actually consult this table', () => {
    // If either call is dropped, every assertion below still passes while the dead-end returns.
    expect(PROXY).toContain('hasPublicTwin')
    expect(PROXY).toContain("from '@/lib/nav/public-twin'")
    expect(LAYOUT).toContain('matchPublicTwin')
    expect(LAYOUT).toContain("from '@/lib/nav/public-twin'")
  })

  it('the proxy exempts twin routes from the sign-in bounce', () => {
    // The exemption has to be part of the isProtected expression, not merely computed.
    expect(PROXY).toContain('!isTwinRedirectable')
  })

  describe('the three families whose twin is a pure rewrite', () => {
    const DIRECT: [string, string][] = [
      ['/journeys/morning-light', '/discover/journeys/morning-light'],
      ['/partners/rapid-cold-plunge', '/discover/partners/rapid-cold-plunge'],
      ['/practices/abc-123', '/discover/practices/abc-123'],
    ]
    for (const [from, to] of DIRECT) {
      it(`${from} resolves to ${to} with no lookup`, () => {
        const m = matchPublicTwin(from)
        expect(m?.path).toBe(to)
        expect(m?.lookup).toBeUndefined()
      })
    }
  })

  describe('the two families that are keyed differently on each side', () => {
    it('a Circle needs the slug to id lookup', () => {
      const m = matchPublicTwin('/circles/sunrise-swim')
      expect(m?.lookup).toBe('circle')
      expect(m?.segment).toBe('sunrise-swim')
      // No path: resolving it without the lookup would send the visitor to a 404.
      expect(m?.path).toBeUndefined()
    })
    it('a Channel needs the id to slug lookup', () => {
      const m = matchPublicTwin('/channels/2f1c9a44-0000-4000-8000-000000000000')
      expect(m?.lookup).toBe('channel')
      expect(m?.path).toBeUndefined()
    })
  })

  it('index pages keep no twin, so they stay members-only', () => {
    for (const p of ['/circles', '/practices', '/journeys', '/partners', '/channels']) {
      expect(hasPublicTwin(p), `${p} is an index page and must not redirect`).toBe(false)
    }
  })

  it('every owner sub-route keeps no twin', () => {
    for (const p of [
      '/circles/sunrise-swim/manage',
      '/circles/sunrise-swim/edit',
      '/journeys/morning-light/learn',
      '/journeys/morning-light/edit',
      '/practices/abc-123/edit',
      '/partners/a/collaborators',
      '/channels/abc/settings',
    ]) {
      expect(hasPublicTwin(p), `${p} is an owner sub-route and must not redirect`).toBe(false)
    }
  })

  it('leaves unrelated member surfaces alone', () => {
    for (const p of ['/feed', '/messages', '/settings', '/admin', '/people/danny', '/hubs/north-county']) {
      expect(hasPublicTwin(p)).toBe(false)
    }
  })

  it('handles a null pathname (the header can be absent)', () => {
    expect(hasPublicTwin(null)).toBe(false)
    expect(matchPublicTwin(null)).toBeNull()
  })

  it('every pattern is anchored at both ends and captures exactly one segment', () => {
    for (const rule of TWIN_RULES) {
      expect(rule.re.source.startsWith('^'), `${rule.re} must be anchored at the start`).toBe(true)
      expect(rule.re.source.endsWith('$'), `${rule.re} must be anchored at the end`).toBe(true)
      // A pattern that allowed `/` inside its capture would swallow every sub-route beneath it.
      expect(rule.re.source, `${rule.re} must not allow a slash inside its capture`).toContain('[^/]+')
    }
  })
})
