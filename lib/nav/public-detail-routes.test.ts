import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isAnonPublicDetail, PUBLIC_DETAIL_PATTERNS } from './public-detail-routes'

// THE INVARIANT: a URL advertised in app/sitemap.ts must be reachable by a signed-out crawler.
//
// app/(main)/layout.tsx redirects an anonymous visitor to `/` for any path its public-view predicate
// does not recognise. That predicate and app/sitemap.ts live in different files, serve different
// concerns, and silently drifted — five sitemap-advertised detail families answered crawlers with a
// 307 to the homepage. Nothing failed: the pages existed, the sitemap was valid, and the redirect was
// a deliberate rule that had simply never been told about them. Only a test that reads BOTH sides
// can catch that, so this asserts the sitemap still emits each family and that the predicate admits it.

const SITEMAP = readFileSync('app/sitemap.ts', 'utf8')
const LAYOUT = readFileSync('app/(main)/layout.tsx', 'utf8')

/** One concrete URL per detail family the sitemap builds, with the template it is built from. */
const ADVERTISED: { path: string; sitemapMarker: string }[] = [
  { path: '/store/abc-123', sitemapMarker: '/store/${p.id}' },
  { path: '/market/abc-123', sitemapMarker: '/market/${p.id}' },
  { path: '/housing/abc-123', sitemapMarker: '/housing/${l.id}' },
  { path: '/classifieds/abc-123', sitemapMarker: '/classifieds/' },
  { path: '/spaces/a-space/podcasts/a-show', sitemapMarker: '/podcasts/' },
]

describe('sitemap URLs are reachable by a signed-out crawler', () => {
  it('the layout actually consults this predicate', () => {
    // If someone drops the call, every assertion below would still pass while the bug returns.
    expect(LAYOUT).toContain('isAnonPublicDetail')
    expect(LAYOUT).toContain("from '@/lib/nav/public-detail-routes'")
  })

  for (const { path, sitemapMarker } of ADVERTISED) {
    it(`${path} is advertised AND anonymously viewable`, () => {
      expect(SITEMAP.includes(sitemapMarker), `sitemap no longer emits ${sitemapMarker}`).toBe(true)
      expect(
        isAnonPublicDetail(path),
        `${path} is in the sitemap but the (main) layout would redirect an anon visitor to /`,
      ).toBe(true)
    })
  }

  it('keeps the member index pages and every sub-route members-only', () => {
    // Scope discipline: only the detail routes the sitemap names. A blanket /store or /market rule
    // would expose the member index pages; a loose Space rule would expose manage sub-routes.
    for (const p of ['/store', '/market', '/housing', '/classifieds', '/feed', '/messages']) {
      expect(isAnonPublicDetail(p), `${p} must stay members-only`).toBe(false)
    }
    for (const p of ['/store/abc/edit', '/market/abc/manage', '/spaces/a/podcasts/b/manage', '/spaces/a/settings']) {
      expect(isAnonPublicDetail(p), `${p} must stay members-only`).toBe(false)
    }
  })

  it('handles a null pathname (the header can be absent)', () => {
    expect(isAnonPublicDetail(null)).toBe(false)
  })

  it('every pattern is anchored at both ends, so no sub-route can slip through', () => {
    for (const re of PUBLIC_DETAIL_PATTERNS) {
      expect(re.source.startsWith('^'), `${re} must be anchored at the start`).toBe(true)
      expect(re.source.endsWith('$'), `${re} must be anchored at the end`).toBe(true)
    }
  })
})
