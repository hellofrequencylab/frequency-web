import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { HOT_PATHS } from './perf-baseline.mjs'

// HYG-141 (ADR-1660). The perf baseline timed /people, which ADR-172 turned into a bare redirect
// to /network, so the "People directory" reading measured a 307 and never touched the directory
// query. These tests hold the consequence: every concrete route the harness would sample resolves
// to a page that renders, not to a page whose only job is redirect().
//
// Nothing here sends a request. Importing the harness does not run it (main() is behind
// invokedDirectly), so PERF_BASELINE_BASE_URL is never read by this file.

const APP = join(process.cwd(), 'app')

type Hot = { id: string; route: string; entry: string }
const paths = HOT_PATHS as Hot[]

/** Every app/**\/page.tsx keyed by the URL it serves (route groups and parallel slots dropped). */
function pageIndex(): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
        const segs = relative(APP, dir)
          .split(sep)
          .filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'))
        const url = '/' + segs.join('/')
        out.set(url, [...(out.get(url) ?? []), full])
      }
    }
  }
  walk(APP)
  return out
}

/** A page that calls redirect()/permanentRedirect() and never returns JSX only forwards. */
function isRedirectOnly(src: string): boolean {
  const redirects = /\b(?:permanentRedirect|redirect)\s*\(/.test(src)
  const rendersJsx = /return\s*\(?\s*</.test(src)
  return redirects && !rendersJsx
}

const concrete = paths.filter((p) => p.route.startsWith('/') && !p.route.includes('<'))

describe('perf-baseline hot paths (HYG-141)', () => {
  const index = pageIndex()

  it('has concrete routes to check', () => {
    expect(concrete.length).toBeGreaterThan(0)
  })

  it.each(concrete.map((p) => [p.id, p.route] as const))(
    '%s samples %s, a page that exists and renders rather than redirects',
    (_id, route) => {
      const files = index.get(route) ?? []
      expect(files, `no app page serves ${route}`).not.toHaveLength(0)
      for (const f of files) {
        expect(isRedirectOnly(readFileSync(f, 'utf8')), `${relative(process.cwd(), f)} only redirects`).toBe(false)
      }
    },
  )

  it('times the People directory at /network, where ADR-172 put it, and names the page that reads it', () => {
    const people = paths.find((p) => p.id === 'people-directory')
    expect(people?.route).toBe('/network')
    expect(people?.entry).toContain('app/(main)/network/page.tsx')
  })

  it('the detector flags the /people redirect it was written for', () => {
    const src = readFileSync(join(APP, '(main)', 'people', 'page.tsx'), 'utf8')
    expect(isRedirectOnly(src)).toBe(true)
    expect(isRedirectOnly(readFileSync(join(APP, '(main)', 'network', 'page.tsx'), 'utf8'))).toBe(false)
  })
})
