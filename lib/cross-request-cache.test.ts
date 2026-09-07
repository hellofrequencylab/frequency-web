import { describe, it, expect, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { sourceWithoutComments } from '@/test/source-shape'
import {
  CHROME_CACHE_TAGS,
  CROSS_REQUEST_CEILING_SECONDS,
  crossRequestCached,
  invalidateCacheTag,
  isCacheUnavailable,
} from './cross-request-cache'

// ── LIVE-181 / ADR-1243: the global nav chrome is read once per request and kept across them ──
//
// Two halves. The RUNTIME half drives the seam against the real `next/cache` under vitest, where
// there is no incremental cache, and proves the fall-through: a loader tested here runs its real
// read, and a real failure still surfaces. The WIRING half is a census of the tree: which loaders
// are deduped per request, which rows are cached across requests under which tag, that every
// writer of a cached table expires that tag, that nothing viewer-shaped sits inside a cache
// boundary, and that the per-viewer filtering still happens in the renderer, after it. It fails on
// the tree before this change (no seam, no sources, seventeen uncached menu queries) and on any
// tree that adds a cross-request read without putting it in this census.

const ROOT = path.join(import.meta.dirname, '..')
const src = (rel: string) => sourceWithoutComments(path.join(ROOT, rel))

const READ = 'lib/menus/read.ts'
const SOURCES = 'lib/layout/chrome-sources.ts'
const FLAGS = 'lib/platform-flags.ts'
const SEAM = 'lib/cross-request-cache.ts'

/** Every non-test source file under the app tree. Dirents, so the walk asks the filesystem once
 *  per entry (scripts/walker-dirents.mjs, ADR-1185). */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p)
  }
  return out
}
const TREE = ['app', 'lib', 'components'].flatMap((d) => walk(path.join(ROOT, d)))
const rel = (abs: string) => path.relative(ROOT, abs)
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length

/** The slice of a file between two anchors: the body of one declaration. */
function between(s: string, from: string, to: string): string {
  const a = s.indexOf(from)
  const b = s.indexOf(to, a + from.length)
  if (a === -1 || b === -1) throw new Error(`anchors not found: ${from} .. ${to}`)
  return s.slice(a, b)
}

describe('crossRequestCached: the runtime seam', () => {
  it('falls through to the read exactly once when there is no incremental cache (vitest, scripts)', async () => {
    const read = vi.fn(async (key: string) => ({ key, n: 1 }))
    const cached = crossRequestCached(read, ['test', 'rows'], { tags: [CHROME_CACHE_TAGS.menus] })
    await expect(cached('a')).resolves.toEqual({ key: 'a', n: 1 })
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith('a')
  })

  it("surfaces the read's own error rather than masking it as a cache miss", async () => {
    const read = vi.fn(async () => {
      throw new Error('menus query failed: relation does not exist')
    })
    const cached = crossRequestCached(read, ['test', 'throws'], { tags: [CHROME_CACHE_TAGS.menus] })
    await expect(cached()).rejects.toThrow('menus query failed')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('recognises only the missing-incremental-cache invariant as "cache unavailable"', () => {
    const e469 = Object.assign(new Error('Invariant: incrementalCache missing in unstable_cache'), {
      __NEXT_ERROR_CODE: 'E469',
    })
    expect(isCacheUnavailable(e469)).toBe(true)
    expect(isCacheUnavailable(new Error('Invariant: incrementalCache missing'))).toBe(true)
    expect(isCacheUnavailable(new Error('relation "menus" does not exist'))).toBe(false)
    expect(isCacheUnavailable(Object.assign(new Error('x'), { __NEXT_ERROR_CODE: 'E263' }))).toBe(false)
    expect(isCacheUnavailable(null)).toBe(false)
  })

  it('invalidateCacheTag is a no-op outside a Next request and never throws there', () => {
    for (const tag of Object.values(CHROME_CACHE_TAGS)) expect(() => invalidateCacheTag(tag)).not.toThrow()
  })

  it('carries a ceiling, so a write that bypasses the app (SQL) is bounded, and five distinct tags', () => {
    expect(CROSS_REQUEST_CEILING_SECONDS).toBeGreaterThan(0)
    expect(CROSS_REQUEST_CEILING_SECONDS).toBeLessThanOrEqual(3600)
    const tags = Object.values(CHROME_CACHE_TAGS)
    expect(new Set(tags).size).toBe(5)
    for (const t of tags) expect(t.length).toBeLessThanOrEqual(256)
  })
})

describe('the census: what is cached, at which scope, under which tag', () => {
  it('unstable_cache has exactly one call site in the tree, the seam', () => {
    const callers = TREE.filter((f) => /\bunstable_cache\(/.test(sourceWithoutComments(f))).map(rel)
    expect(callers).toEqual([SEAM])
  })

  it('exactly five row sources are cached across requests, each under its own tag', () => {
    const sites = TREE.filter((f) => /\bcrossRequestCached\(/.test(sourceWithoutComments(f, { imports: true })))
      .map(rel)
      .sort()
    expect(sites).toEqual([SOURCES, READ, FLAGS].sort())

    const read = src(READ)
    const sources = src(SOURCES)
    const flags = src(FLAGS)
    expect(count(read, /\bcrossRequestCached\(/g)).toBe(2)
    expect(count(sources, /\bcrossRequestCached\(/g)).toBe(2)
    expect(count(flags, /\bcrossRequestCached\(/g)).toBe(1)

    // menus (menus + menu_categories + menu_items + menu_rail_cards) and menu_settings
    expect(between(read, 'const menuRows = crossRequestCached(', '\n)')).toContain('tags: [CHROME_CACHE_TAGS.menus]')
    expect(between(read, 'const menuSettingsRow = crossRequestCached(', '\n)')).toContain(
      'tags: [CHROME_CACHE_TAGS.menuSettings]',
    )
    // page_chrome_overrides and app_overrides
    expect(between(sources, 'const chromeOverrideRows = crossRequestCached(', '\n)')).toContain(
      'tags: [CHROME_CACHE_TAGS.pageChrome]',
    )
    expect(between(sources, 'const appOverrideRows = crossRequestCached(', '\n)')).toContain(
      'tags: [CHROME_CACHE_TAGS.appOverrides]',
    )
    // platform_flags
    expect(between(flags, 'const demoModeFlagRow = crossRequestCached(', '\n)')).toContain(
      'tags: [CHROME_CACHE_TAGS.platformFlags]',
    )
  })

  it('the six chrome loaders are deduped per request with React cache()', () => {
    const read = src(READ)
    expect(read).toMatch(/const getMenuCached = cache\(/)
    expect(read).toMatch(/export const getMenuSettings = cache\(/)
    const sources = src(SOURCES)
    expect(sources).toMatch(/export const loadCachedChromeOverrides = cache\(/)
    expect(sources).toMatch(/export const loadCachedAppOverrides = cache\(/)
    expect(src(FLAGS)).toMatch(/export const demoModeEnabled = cache\(/)
    expect(src('lib/staff.ts')).toMatch(/export const getStaffMember = cache\(/)
  })

  it('the shell reads the two override tables through the cached sources, the editors read direct', () => {
    const layout = src('app/(main)/layout.tsx')
    expect(layout).toMatch(/loadCachedChromeOverrides\(\)/)
    expect(layout).toMatch(/loadCachedAppOverrides\(/)
    expect(layout).not.toMatch(/\bloadChromeOverrides\(/)
    expect(layout).not.toMatch(/\bloadAppOverrides\(/)
    // The manager pages keep the direct read so they show the row an operator just saved.
    expect(src('app/(main)/admin/page-layout/page.tsx')).toMatch(/\bloadChromeOverrides\(\)/)
    expect(src('app/(main)/admin/page-layout/apps/page.tsx')).toMatch(/\bloadAppOverrides\(/)
  })

  it('the shell menu read is cached twice; the editor alias reads the truth', () => {
    const read = src(READ)
    const shell = between(read, 'const getMenuCached = cache(', '\n)')
    expect(shell).toContain('resolveMenu(surfaceKey, spaceId, menuRows)')
    const editor = between(read, 'export async function getAdminMenu(', '\n}')
    expect(editor).toContain('resolveMenu(surfaceKey, opts?.spaceId ?? null, readMenuRows)')
    expect(editor).not.toContain('menuRows)')
  })
})

describe('the privilege rule: rows cross the boundary, viewers never do', () => {
  const VIEWER_SHAPED = [/\bheaders\(/, /\bcookies\(/, /\bgetUser\(/, /\bgetCallerProfile\b/, /\bgetMyProfileId\b/, /\bviewer/i, /\bprofileId\b/]

  it('no cached read body touches request headers, cookies, the session, or a viewer', () => {
    const read = src(READ)
    const bodies = [
      between(read, 'async function readMenuRows(', 'const menuRows = crossRequestCached('),
      between(read, 'const menuSettingsRow = crossRequestCached(', 'export const getMenuSettings'),
      src(SOURCES),
      between(src(FLAGS), 'const demoModeFlagRow = crossRequestCached(', '\n)'),
    ]
    for (const body of bodies) for (const re of VIEWER_SHAPED) expect(body).not.toMatch(re)
  })

  it('the cached menu rows carry no gate: defaults and registry gates run after the boundary', () => {
    const read = src(READ)
    const rows = between(read, 'async function readMenuRows(', 'const menuRows = crossRequestCached(')
    expect(rows).not.toContain('applyRegistryGates(')
    expect(rows).not.toContain('defaultMenu(')
    const resolve = between(read, 'async function resolveMenu(', 'const getMenuCached = cache(')
    expect(resolve).toContain('applyRegistryGates(resolved)')
    expect(resolve).toContain('defaultMenu(surfaceKey)')
  })

  it('a cached read throws on a failed query, so a fallback is never stored as data', () => {
    const read = src(READ)
    expect(between(read, 'async function readMenuRows(', 'const menuRows = crossRequestCached(')).toMatch(
      /if \(menuError\) throw new Error\(/,
    )
    expect(between(read, 'const menuSettingsRow = crossRequestCached(', '\n)')).toMatch(/if \(error\) throw new Error\(/)
    expect(count(src(SOURCES), /if \(error\) throw new Error\(/g)).toBe(2)
    expect(between(src(FLAGS), 'const demoModeFlagRow = crossRequestCached(', '\n)')).toMatch(/if \(error\) throw new Error\(/)
  })

  it('the per-viewer menu filter still runs in the renderer, after both caches', () => {
    const shell = src('components/layout/app-shell.tsx')
    expect(count(shell, /\bcanSeeMenuItem\(/g)).toBeGreaterThanOrEqual(3)
    expect(count(shell, /\beffectiveMode\(/g)).toBeGreaterThanOrEqual(1)
    // The reader hands the renderer everything; it does not import the viewer filter.
    expect(src(READ)).not.toContain('canSeeMenuItem')
  })

  it('the cached sources are server-only and reached by no client module', () => {
    expect(readFileSync(path.join(ROOT, SEAM), 'utf8')).toMatch(/^import 'server-only'/)
    expect(readFileSync(path.join(ROOT, SOURCES), 'utf8')).toMatch(/^import 'server-only'/)
    const clientImporters = TREE.filter((f) => {
      const s = readFileSync(f, 'utf8')
      return /^['"]use client['"]/.test(s) && /cross-request-cache|chrome-sources/.test(s)
    }).map(rel)
    expect(clientImporters).toEqual([])
    // The two client-safe loaders keep next/cache out of their (dynamically imported) graph.
    expect(src('lib/layout/page-chrome.ts')).not.toContain('next/cache')
    expect(src('lib/apps/overrides.ts')).not.toContain('next/cache')
  })
})

describe('every writer of a cached table expires its tag beside the write', () => {
  /** Files that MUTATE `table`: a `.from('<table>')` (typed or not) followed by a mutation verb
   *  before the next `.from(`. A select-only mention is not a writer. */
  function writersOf(table: string): string[] {
    const from = new RegExp(`\\.from(?:<[^>]*>)?\\(\\s*'${table}'\\s*\\)`, 'g')
    return TREE.filter((f) => {
      const s = sourceWithoutComments(f)
      let m: RegExpExecArray | null
      while ((m = from.exec(s))) {
        const next = s.indexOf('.from(', m.index + m[0].length)
        const window = s.slice(m.index, next === -1 ? m.index + 600 : Math.min(next, m.index + 600))
        if (/\.(upsert|insert|update|delete)\(/.test(window)) return true
      }
      return false
    }).map(rel)
  }

  const busts = (file: string, tag: keyof typeof CHROME_CACHE_TAGS) =>
    count(src(file), new RegExp(`invalidateCacheTag\\(CHROME_CACHE_TAGS\\.${tag}\\)`, 'g'))

  it('menus: one writer module, every write path through bustMenus / bustMenuSettings', () => {
    for (const t of ['menus', 'menu_categories', 'menu_items', 'menu_rail_cards', 'menu_settings']) {
      expect(writersOf(t), t).toEqual(['lib/menus/actions.ts'])
    }
    const actions = src('lib/menus/actions.ts')
    expect(busts('lib/menus/actions.ts', 'menus')).toBe(1)
    expect(busts('lib/menus/actions.ts', 'menuSettings')).toBe(1)
    // The only two layout revalidations left are inside the two helpers; every action calls one.
    expect(count(actions, /revalidatePath\('\/', 'layout'\)/g)).toBe(2)
    expect(count(actions, /\bbustMenus\(\)/g)).toBe(18) // 17 call sites + the definition
    expect(count(actions, /\bbustMenuSettings\(\)/g)).toBe(2) // 1 call site + the definition
    // Every exported mutation ends in one of the two; the count above is not a loose floor.
    expect(count(actions, /export async function /g)).toBe(18)
  })

  it('page_chrome_overrides and app_overrides: the page-layout manager busts on save and reset', () => {
    expect(writersOf('page_chrome_overrides')).toEqual(['app/(main)/admin/page-layout/actions.ts'])
    expect(busts('app/(main)/admin/page-layout/actions.ts', 'pageChrome')).toBe(2)
    expect(writersOf('app_overrides')).toEqual(['app/(main)/admin/page-layout/app-actions.ts'])
    expect(busts('app/(main)/admin/page-layout/app-actions.ts', 'appOverrides')).toBe(2)
  })

  it('platform_flags: both writers bust, and a new writer must join this list', () => {
    const writers = writersOf('platform_flags').sort()
    expect(writers).toEqual(['app/(main)/admin/demo/actions.ts', 'lib/platform-flags.ts'])
    for (const w of writers) expect(busts(w, 'platformFlags'), w).toBeGreaterThanOrEqual(1)
  })
})
