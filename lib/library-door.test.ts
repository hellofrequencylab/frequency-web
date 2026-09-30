import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import nextConfig from '../next.config'
import { NAV_AREAS } from '@/lib/nav-areas'
import { CONTENT_EDIT_ROUTES } from '@/lib/layout/editable-content'
import { ROUTE_MODULE_IDS } from '@/lib/widgets/modules'
import {
  BEST_OF_ANCHOR,
  bestOfHref,
  parseBestOf,
} from '@/components/widgets/practices/best-of-view'

// LIVE-681 / ADR-1678: one front door. The owner ruled that Practices and the Library were two doors
// to overlapping things and merged the Library INTO /practices. These lock the consequence a member
// meets: an old /library link lands on /practices for good (308) with its query intact, the query
// still opens the lane it named, the review queue keeps its own route, and no menu offers the old door.

type Redirect = { source: string; destination: string; permanent?: boolean }

async function redirects(): Promise<Redirect[]> {
  const fn = nextConfig.redirects
  if (typeof fn !== 'function') return []
  return (await fn.call(nextConfig)) as Redirect[]
}

/** Exact-or-param source match, the only shapes this file needs (no regex groups). */
function matches(source: string, path: string): boolean {
  const s = source.split('/')
  const p = path.split('/')
  for (let i = 0; i < s.length; i++) {
    const seg = s[i]
    if (seg.endsWith('*')) return true
    if (i >= p.length) return false
    if (seg.startsWith(':')) continue
    if (seg !== p[i]) return false
  }
  return s.length === p.length
}

describe('/library redirects to /practices', () => {
  it('is one permanent (308) rule from /library to /practices', async () => {
    const rules = (await redirects()).filter((r) => matches(r.source, '/library'))
    expect(rules).toEqual([{ source: '/library', destination: '/practices', permanent: true }])
  })

  it('leaves the staff review queue on its own route', async () => {
    const eating = (await redirects()).filter((r) => matches(r.source, '/library/review'))
    expect(eating.map((r) => `${r.source} -> ${r.destination}`)).toEqual([])
    expect(existsSync('app/(main)/library/review/page.tsx')).toBe(true)
  })

  it('has no page left behind the rule (a redirect is checked before the filesystem)', () => {
    expect(existsSync('app/(main)/library/page.tsx')).toBe(false)
  })

  it('the destination carries no query of its own, so the forwarded query is the whole query', async () => {
    const rule = (await redirects()).find((r) => r.source === '/library')
    expect(rule?.destination).not.toContain('?')
  })
})

describe('the forwarded /library query opens the same lane on /practices', () => {
  // Next forwards the request query onto the destination, so /library?type=journey arrives as
  // /practices?type=journey and the practices-best-of block reads it from x-search.
  it('reads the lanes the Library page offered', () => {
    expect(parseBestOf('?type=journey')).toEqual({ type: 'journey', expanded: false })
    expect(parseBestOf('type=practice')).toEqual({ type: 'practice', expanded: false })
    expect(parseBestOf('')).toEqual({ type: null, expanded: false })
  })

  it('falls back to All for a type the Library never had', () => {
    expect(parseBestOf('?type=program').type).toBeNull()
  })

  it('opens the whole ranked catalog on best=all', () => {
    expect(parseBestOf('?best=all').expanded).toBe(true)
  })

  it('builds lane links that keep the practice library facets and land on the block', () => {
    const search = '?pillar=body&sort=top&type=journey'
    expect(bestOfHref(search, { lane: 'all' })).toBe(`/practices?pillar=body&sort=top#${BEST_OF_ANCHOR}`)
    expect(bestOfHref(search, { lane: 'practice' })).toBe(
      `/practices?pillar=body&sort=top&type=practice#${BEST_OF_ANCHOR}`,
    )
    expect(bestOfHref('', { expanded: true })).toBe(`/practices?best=all#${BEST_OF_ANCHOR}`)
    expect(bestOfHref('?best=all', { expanded: false })).toBe(`/practices#${BEST_OF_ANCHOR}`)
  })

  it('marks the lane it is on as active (the active href equals that tab href)', () => {
    const search = '?type=journey&tag=morning'
    const active = bestOfHref(search, { lane: parseBestOf(search).type ?? 'all' })
    expect(active).toBe(bestOfHref(search, { lane: 'journey' }))
    expect(active).not.toBe(bestOfHref(search, { lane: 'all' }))
  })
})

describe('/practices holds what the Library held', () => {
  it('places the ranked best-of block on /practices, registered to a renderer', () => {
    expect(ROUTE_MODULE_IDS['/practices']).toContain('practices-best-of')
    // Read as source: importing the registry pulls in every server widget and its runtime.
    expect(readFileSync('lib/widgets/registry.tsx', 'utf8')).toMatch(/'practices-best-of': PracticesBestOf,/)
  })

  it('carries the review queue door for the people the queue admits', () => {
    const src = readFileSync('app/(main)/practices/page.tsx', 'utf8')
    expect(src).toMatch(/canReviewLibrarySubmission\(caller\.webRole\)/)
    expect(src).toContain('href="/library/review"')
  })

  it('revalidates /practices on a rating or a review, since /library renders nothing now', () => {
    const src = readFileSync('app/(main)/library/actions.ts', 'utf8')
    expect(src).not.toMatch(/revalidatePath\('\/library'\)/)
    expect(src).toMatch(/revalidatePath\('\/practices'\)/)
  })
})

describe('no menu offers the old door', () => {
  it('has no rail row pointing at /library', () => {
    expect(NAV_AREAS.filter((a) => a.href === '/library').map((a) => a.key)).toEqual([])
  })

  it('no longer offers /library as an editable page header', () => {
    expect((CONTENT_EDIT_ROUTES as readonly string[]).includes('/library')).toBe(false)
  })

  it('has no footer, known-route, or review-page link to /library', () => {
    for (const f of [
      'lib/nav/registry.ts',
      'components/admin/menu/known-routes.ts',
      'app/(main)/library/review/page.tsx',
    ]) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/['"]\/library['"]/)
    }
  })
})
