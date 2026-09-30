import { describe, it, expect, beforeAll } from 'vitest'
import { createRequire } from 'node:module'

// LIVE-713 (ADR-1641): the Permissions-Policy each path is actually served, read the way the
// router reads it. next.config.ts is loaded through Next's own config loader, its headers() go
// through Next's own route normaliser, and each source compiles to the regex that lands in
// routes-manifest.json (the `src` the platform router matches). Asserting on the config text
// instead would pass a rule the router never matches, or miss a second rule that also does.

const require = createRequire(import.meta.url)

type Header = { key: string; value: string }
let routes: { source: string; headers: Header[]; re: RegExp }[] = []

beforeAll(async () => {
  const loadConfig = require('next/dist/server/config').default
  const loadCustomRoutes = require('next/dist/lib/load-custom-routes').default
  const { buildCustomRoute } = require('next/dist/lib/build-custom-route')
  const config = await loadConfig('phase-production-server', process.cwd(), { silent: true })
  const { headers } = await loadCustomRoutes(config)
  routes = headers.map((h: { source: string; headers: Header[] }) => ({
    ...h,
    // Case-insensitive, like the router (caseSensitiveRoutes is off).
    re: new RegExp(buildCustomRoute('header', h).regex, 'i'),
  }))
}, 60_000)

function policiesFor(path: string): string[] {
  return routes
    .filter((r) => r.re.test(path))
    .flatMap((r) => r.headers.filter((h) => h.key.toLowerCase() === 'permissions-policy').map((h) => h.value))
}

function directives(policy: string): Record<string, string> {
  return Object.fromEntries(policy.split(',').map((d) => d.trim().split('=') as [string, string]))
}

const CAMERA_PATHS = ['/scan', '/scan/', '/SCAN']
const OTHER_PATHS = ['/', '/feed', '/partners/acme', '/scanner', '/events/scan', '/n/node-1', '/u/scan']

describe('Permissions-Policy per path (LIVE-713)', () => {
  it.each([...CAMERA_PATHS, ...OTHER_PATHS])('%s is served exactly one Permissions-Policy', (path) => {
    // Two matching rules is how a proxy ends up sending two header lines; the browser then lets
    // the later `camera` key win, so the answer would hang on emit order.
    expect(policiesFor(path)).toHaveLength(1)
  })

  it.each(CAMERA_PATHS)('%s, the in-app scanner, may use the camera from this origin only', (path) => {
    expect(directives(policiesFor(path)[0]).camera).toBe('(self)')
  })

  it.each(OTHER_PATHS)('%s refuses the camera', (path) => {
    expect(directives(policiesFor(path)[0]).camera).toBe('()')
  })

  it.each([...CAMERA_PATHS, ...OTHER_PATHS])('%s keeps microphone off and geolocation on this origin', (path) => {
    const d = directives(policiesFor(path)[0])
    expect(d.microphone).toBe('()')
    expect(d.geolocation).toBe('(self)')
  })

  it('still serves the rest of the security headers on the scanner route', () => {
    const keys = routes.filter((r) => r.re.test('/scan')).flatMap((r) => r.headers.map((h) => h.key))
    for (const key of ['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Strict-Transport-Security', 'Content-Security-Policy']) {
      expect(keys).toContain(key)
    }
  })
})
