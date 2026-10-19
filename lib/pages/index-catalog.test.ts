import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CODED_UNDER_FREQUENCY, FREQUENCY_ONLY_PATHS, PAGE_INDEX } from './index-catalog'
import { SITE_DESIGN } from '@/lib/theme/design'
import { EDITABLE_PAGES } from '@/lib/page-editor/data'
import { MANAGED_ROUTES } from '@/lib/layout/page-chrome'
import { ROUTES } from '@/lib/frequency/site-nav'

// The page index is a catalog of OTHER registries, so these assertions are what keep it from
// drifting: a block page nobody placed, a row whose route no longer exists, a design-switch set that
// no longer matches the route files. Each reads the tree it judges rather than a copy of it.

const ALL = PAGE_INDEX.flatMap((s) => s.pages)

/** Every `app/**\/page.tsx` as a public path: route groups `(x)` drop out, dynamic segments keep their
 *  brackets, so `/for/[niche]` is the door family's route. */
function routePaths(): Set<string> {
  const out = new Set<string>()
  const walk = (dir: string, segs: string[]) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        if (name.startsWith('@')) continue // a parallel slot, not a segment
        if (name.startsWith('(')) walk(full, segs)
        else walk(full, [...segs, name])
      } else if (name === 'page.tsx') {
        out.add('/' + segs.join('/'))
      }
    }
  }
  walk('app', [])
  return out
}

function routeFileFor(path: string): string {
  const slug = EDITABLE_PAGES.find((p) => p.path === path)?.slug
  const candidates = ['app/page.tsx', `app/(marketing)${path}/page.tsx`, `app/(main)${path}/page.tsx`]
  for (const c of path === '/' ? [candidates[0]] : candidates.slice(1)) {
    try {
      return readFileSync(c, 'utf8')
    } catch {
      /* next candidate */
    }
  }
  throw new Error(`no route file for ${path} (slug ${slug})`)
}

describe('the page index places every block-editor page exactly once', () => {
  it('every EDITABLE_PAGES slug has one row, as blocks or as the coded page that replaced it', () => {
    for (const p of EDITABLE_PAGES) {
      const rows = ALL.filter((r) => r.path === p.path)
      expect(rows, `${p.slug} (${p.path}) is not placed in lib/pages/index-catalog.ts`).toHaveLength(1)
      const row = rows[0]!
      expect(['blocks', 'coded']).toContain(row.editor)
      if (row.editor === 'blocks') expect(row.slug).toBe(p.slug)
      else expect(row.slug).toBeUndefined()
    }
  })

  it('every blocks row names an enrolled slug, so Edit never opens a gated editor', () => {
    for (const r of ALL.filter((r) => r.editor === 'blocks')) {
      expect(EDITABLE_PAGES.some((p) => p.slug === r.slug && p.path === r.path), r.path).toBe(true)
    }
  })

  it('no path is listed twice across the three lists', () => {
    const paths = ALL.map((r) => r.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('every row is a page the tree serves', () => {
  it('each static path has a route file; a family path resolves to its dynamic route', () => {
    const routes = routePaths()
    for (const r of ALL) {
      const direct = routes.has(r.path)
      const family =
        r.count != null &&
        [...routes].some((route) => {
          const rs = route.split('/')
          const ps = r.path.split('/')
          return rs.length === ps.length && rs.every((s, i) => s === ps[i] || /^\[.+\]$/.test(s))
        })
      expect(direct || family, `${r.path} has no app/ route`).toBe(true)
    }
  })

  it('a family row carries a live count from its registry', () => {
    const families = ALL.filter((r) => r.count != null)
    expect(families.length).toBeGreaterThanOrEqual(2)
    for (const f of families) expect(f.count, f.path).toBeGreaterThan(0)
  })
})

describe('the design switch set mirrors the route files (ADR-1737)', () => {
  it('each CODED_UNDER_FREQUENCY slug branches on SITE_DESIGN in its route file, and no other block slug does', () => {
    for (const p of EDITABLE_PAGES) {
      const src = routeFileFor(p.path)
      const branches = /SITE_DESIGN === 'frequency'/.test(src)
      expect(branches, `${p.slug}: route file ${branches ? 'branches' : 'does not branch'} on the design`).toBe(
        CODED_UNDER_FREQUENCY.has(p.slug),
      )
    }
  })
})

describe('the index covers every page the site chrome links to', () => {
  it('every ROUTES entry of the Frequency site nav is a Site or System row, or an in-app page', () => {
    const indexed = new Set([...ALL.map((r) => r.path), ...MANAGED_ROUTES.map((r) => r.route)])
    for (const [key, value] of Object.entries(ROUTES)) {
      if (!value) continue // hidden (stories) or unrouted
      const path = value.split(/[?#]/)[0]!
      if (SITE_DESIGN !== 'frequency' && FREQUENCY_ONLY_PATHS.has(path)) continue
      expect(indexed.has(path), `ROUTES.${key} (${path}) is not in the page index`).toBe(true)
    }
  })

  it('a Frequency-only route is a row exactly on a Frequency build', () => {
    for (const path of FREQUENCY_ONLY_PATHS) {
      expect(ALL.some((r) => r.path === path), path).toBe(SITE_DESIGN === 'frequency')
    }
  })

  it('lists run most important first: Site, then Lead and SEO, then System', () => {
    expect(PAGE_INDEX.map((s) => s.id)).toEqual(['site', 'lead', 'system'])
  })
})
