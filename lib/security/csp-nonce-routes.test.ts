import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isNonceRoute } from './csp-nonce'

// WHICH PAGES GET THE NONCE-BASED POLICY (SCAN-1243, ADR-1954), held against the real app/ tree.
//
// A nonce only reaches a page Next renders per request. Sent on a static or ISR page, the strict
// policy would block every script on it, because the prerendered HTML carries no nonce. So the rule
// in lib/security/csp-nonce.ts must match the member app (app/(main), a per-request render) and
// NOTHING else. This walks app/ and checks both directions, plus the two facts the rule leans on.

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const APP = join(ROOT, 'app')
const MAIN = '(main)'

interface Page {
  file: string
  inMain: boolean
  /** A concrete URL this page answers. */
  sample: string
}

function isGroup(name: string) {
  return /^\(.+\)$/.test(name) && !/^\(\.+\)/.test(name)
}

function walk(dir: string, segments: string[], inMain: boolean, out: Page[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const name = entry.name
      if (name === 'api' && segments.length === 0) continue // route handlers, no documents
      if (name.startsWith('_')) continue // private folders
      if (name.startsWith('@')) continue // parallel slots render inside a page that is walked anyway
      if (/^\(\.+\)/.test(name)) continue // intercepting routes: only ever a client navigation
      if (isGroup(name)) walk(full, segments, inMain || (segments.length === 0 && name === MAIN), out)
      else walk(full, [...segments, name], inMain, out)
    } else if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      const parts = segments
        .map((segment) => {
          if (/^\[\[\.\.\..+\]\]$/.test(segment)) return null
          if (/^\[\.\.\..+\]$/.test(segment)) return 'sample-a/sample-b'
          if (/^\[.+\]$/.test(segment)) return `sample-${segment.slice(1, -1).toLowerCase()}`
          return segment
        })
        .filter((part): part is string => part !== null)
      out.push({ file: full.slice(ROOT.length), inMain, sample: '/' + parts.join('/') })
    }
  }
}

const pages: Page[] = []
walk(APP, [], false, pages)
const memberPages = pages.filter((page) => page.inMain)
const otherPages = pages.filter((page) => !page.inMain)

describe('the nonce policy reaches the member app and nothing else', () => {
  it('found the tree', () => {
    expect(memberPages.length).toBeGreaterThan(150)
    expect(otherPages.length).toBeGreaterThan(50)
  })

  it('🔴 no page outside app/(main) matches: a static page must never get a nonce policy', () => {
    const wrong = otherPages.filter((page) => isNonceRoute(page.sample)).map((page) => `${page.sample}  (${page.file})`)
    expect(wrong, 'these pages are outside the member app but would be sent the nonce policy').toEqual([])
  })

  it('every page inside app/(main) matches', () => {
    // The group's own catch-all is the not-found route: it answers every unmatched URL on the site
    // and renders no member page, so it is the one page here that is deliberately out.
    const missing = memberPages
      .filter((page) => !/\[\.\.\.catchAll\]/.test(page.file))
      .filter((page) => !isNonceRoute(page.sample))
      .map((page) => `${page.sample}  (${page.file})`)
    expect(
      missing,
      'a member page the nonce policy does not cover: add its first segment to MEMBER_SEGMENTS (or a rule to SHARED_SEGMENT_RULES) in lib/security/csp-nonce.ts',
    ).toEqual([])
  })

  it('the paths the proxy rewrites a member to are covered', () => {
    expect(isNonceRoute('/events/sound-bath/full')).toBe(true)
    expect(isNonceRoute('/spaces/acme/full')).toBe(true)
    expect(isNonceRoute('/spaces/acme/full/podcasts/the-show')).toBe(true)
  })

  it('and the share pages those rewrites start from are not', () => {
    for (const path of ['/events/sound-bath', '/spaces/acme', '/spaces/acme/podcasts/the-show', '/spaces', '/market/42', '/store/42', '/classifieds/42', '/housing/42', '/events/claim/tok', '/spaces/claim/tok', '/spaces/acme/spotlight', '/feed-preview', '/hosted/example.com', '/sites/acme']) {
      expect(isNonceRoute(path), path).toBe(false)
    }
  })

  it('a trailing slash does not change the answer', () => {
    expect(isNonceRoute('/feed/')).toBe(true)
    expect(isNonceRoute('/events/')).toBe(true)
    expect(isNonceRoute('/spaces/')).toBe(false)
    expect(isNonceRoute('/')).toBe(false)
  })
})

describe('the two facts the rule leans on', () => {
  it('the (main) layout reads the request on every render, so every page under it is per-request', () => {
    const layout = readFileSync(join(APP, MAIN, 'layout.tsx'), 'utf8')
    const body = layout.slice(layout.indexOf('export default async function MainLayout'))
    const firstRead = body.indexOf('await headers()')
    const firstReturn = body.search(/\n {2}return /)
    expect(firstRead).toBeGreaterThan(-1)
    // Before any top-level return: no branch of the layout skips the request read.
    expect(firstReturn === -1 || firstRead < firstReturn).toBe(true)
  })

  it('no page or layout under app/(main) opts back into static rendering', () => {
    const offenders: string[] = []
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) scan(full)
        else if (/^(page|layout)\.(tsx|ts)$/.test(entry.name)) {
          if (/\[\.\.\.catchAll\]/.test(full)) continue // the closed not-found route, see above
          const source = readFileSync(full, 'utf8')
          if (/export const dynamic\s*=\s*['"](?:force-static|error)['"]/.test(source) || /export const revalidate\s*=/.test(source) || /export (?:async )?function generateStaticParams/.test(source)) {
            offenders.push(full.slice(ROOT.length))
          }
        }
      }
    }
    scan(join(APP, MAIN))
    expect(offenders, 'a member page that prerenders cannot carry a nonce: take its path out of the nonce rule first').toEqual([])
  })
})
