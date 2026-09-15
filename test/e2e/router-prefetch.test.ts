// The capture's prefetch refusal, proven without a browser (LIVE-328, ADR-1328).
//
// ADR-949: a guard is not trusted until it has been observed firing, and this one has two ways
// to be wrong that a green run would hide. Refuse too little and every member page still costs
// one render plus every link in its shell, which is the load ADR-1328 measured. Refuse too much
// (on the `_rsc` query alone, say) and the fetch a real navigation issues is refused with it, so
// the first click in any future spec would fall back to a full document load and nobody would
// know why. Both branches are pinned here on a fake route, and the wiring is pinned by source
// shape: the handler is only worth anything if every spec's `test` installs it.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isRouterPrefetch,
  isRscRequestUrl,
  routerPrefetchRoute,
  type RouterPrefetchRoute,
} from './surfaces'

const BASE = 'https://preview.example.test'

interface FakeRoute extends RouterPrefetchRoute {
  fulfilled: { status: number }[]
  fellBack: number
}

/** A route as Playwright would hand it over: lower-cased header names, a URL with `_rsc`. */
function fakeRoute(url: string, headers: Record<string, string>): FakeRoute {
  const route: FakeRoute = {
    fulfilled: [],
    fellBack: 0,
    request: () => ({ url: () => url, headers: () => headers }),
    fulfill: async (response) => {
      route.fulfilled.push({ status: response.status })
    },
    fallback: async () => {
      route.fellBack += 1
    },
  }
  return route
}

/** What a viewport prefetch of `/feed` looks like on the wire from Next 16's classic path. */
const PREFETCH_HEADERS = {
  rsc: '1',
  'next-router-prefetch': '1',
  'next-router-state-tree': '%5B%22%22%2C%7B%7D%5D',
}

/** The same URL fetched by a `router.push`: `rsc` and `_rsc`, no prefetch header. */
const NAVIGATION_HEADERS = {
  rsc: '1',
  'next-router-state-tree': '%5B%22%22%2C%7B%7D%5D',
  'next-url': '/feed',
}

describe('isRscRequestUrl (the selector)', () => {
  it('selects a URL carrying the _rsc cache-busting query, with or without a value', () => {
    expect(isRscRequestUrl(new URL(`${BASE}/feed?_rsc=1a2b3`))).toBe(true)
    expect(isRscRequestUrl(new URL(`${BASE}/feed?_rsc`))).toBe(true)
    expect(isRscRequestUrl(new URL(`${BASE}/discover?tab=events&_rsc=9f`))).toBe(true)
  })

  it('leaves the document request, assets and API calls alone', () => {
    expect(isRscRequestUrl(new URL(`${BASE}/feed`))).toBe(false)
    expect(isRscRequestUrl(new URL(`${BASE}/_next/static/chunks/main.js`))).toBe(false)
    expect(isRscRequestUrl(new URL(`${BASE}/api/health?rsc=1`))).toBe(false)
  })
})

describe('isRouterPrefetch (the verdict)', () => {
  it('is true on Next-Router-Prefetch, whatever the tier', () => {
    expect(isRouterPrefetch({ headers: () => PREFETCH_HEADERS })).toBe(true)
    expect(isRouterPrefetch({ headers: () => ({ ...PREFETCH_HEADERS, 'next-router-prefetch': '2' }) })).toBe(true)
    expect(isRouterPrefetch({ headers: () => ({ ...PREFETCH_HEADERS, 'next-router-prefetch': '3' }) })).toBe(true)
  })

  it('is true on a segment-cache prefetch, which names the segment beside the flag', () => {
    expect(
      isRouterPrefetch({
        headers: () => ({ rsc: '1', 'next-router-prefetch': '1', 'next-router-segment-prefetch': '/_tree' }),
      }),
    ).toBe(true)
    expect(isRouterPrefetch({ headers: () => ({ rsc: '1', 'next-router-segment-prefetch': '/_tree' }) })).toBe(true)
  })

  it('reads the header name case-insensitively, so a fake that did not lower-case still counts', () => {
    expect(isRouterPrefetch({ headers: () => ({ RSC: '1', 'Next-Router-Prefetch': '1' }) })).toBe(true)
  })

  it('is false on the fetch a navigation issues: rsc without the prefetch flag', () => {
    expect(isRouterPrefetch({ headers: () => NAVIGATION_HEADERS })).toBe(false)
  })

  it('is false on a request with no RSC headers at all', () => {
    expect(isRouterPrefetch({ headers: () => ({ accept: 'text/html' }) })).toBe(false)
  })
})

describe('routerPrefetchRoute (the handler)', () => {
  it('fulfils a prefetch with an empty 204 and never falls through to the network', async () => {
    const route = fakeRoute(`${BASE}/feed?_rsc=1a2b3`, PREFETCH_HEADERS)
    await routerPrefetchRoute(route)
    expect(route.fulfilled).toEqual([{ status: 204 }])
    expect(route.fellBack).toBe(0)
  })

  it('lets a navigation fetch through: same URL shape, no prefetch header', async () => {
    const route = fakeRoute(`${BASE}/feed?_rsc=1a2b3`, NAVIGATION_HEADERS)
    await routerPrefetchRoute(route)
    expect(route.fulfilled).toEqual([])
    expect(route.fellBack).toBe(1)
  })

  it('never answers with a status that reads as a failure, which Chromium would log as a console error', async () => {
    const route = fakeRoute(`${BASE}/settings?_rsc=00`, PREFETCH_HEADERS)
    await routerPrefetchRoute(route)
    for (const { status } of route.fulfilled) {
      expect(status).toBeGreaterThanOrEqual(200)
      expect(status).toBeLessThan(300)
    }
  })
})

/* ── The wiring, by source shape ─────────────────────────────────────────── */

const E2E = join(process.cwd(), 'test', 'e2e')

function read(file: string): string {
  return readFileSync(join(E2E, file), 'utf8')
}

describe('every spec takes its test from the fixture that installs the refusal', () => {
  const specs = readdirSync(E2E).filter((f) => f.endsWith('.spec.ts'))

  it('finds the specs it is about to check', () => {
    expect(specs).toEqual(expect.arrayContaining(['a11y.spec.ts', 'overflow.spec.ts', 'smoke.spec.ts', 'visual.spec.ts']))
  })

  for (const spec of specs) {
    it(`${spec} imports test from ./fixtures and not from @playwright/test`, () => {
      const source = read(spec)
      expect(source).toMatch(/import \{[^}]*\btest\b[^}]*\} from '\.\/fixtures'/)
      // A value import of `test` straight from the package would bypass the fixture. Type-only
      // imports (`import type { Page }`) are fine and expected.
      const bare = source.match(/^import \{([^}]*)\} from '@playwright\/test'/gm) ?? []
      for (const line of bare) expect(line).not.toMatch(/\btest\b/)
    })
  }

  it('the fixture installs refuseRouterPrefetch on the context before handing it to the test', () => {
    const fixture = read('fixtures.ts')
    const install = fixture.indexOf('await refuseRouterPrefetch(context)')
    const handOver = fixture.indexOf('await provide(context)')
    expect(install).toBeGreaterThan(-1)
    expect(handOver).toBeGreaterThan(install)
  })
})
