import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── LIVE-196: every Space route renders inside the Space's own AccentScope ────────────────────────
//
// 🔴 THE DEFECT (ADR-1192 §"What is still open"). `AccentScope` — the one wrapper that paints a
// Space's brand accent (`--color-primary*`) and stamps `data-space-theme` for its typography — was
// mounted in `(profile)/layout.tsx`, which wraps ONLY the public profile route group. Every sibling
// subtree (`manage`, `settings`, `crm`, `marketing`, and the public, sitemap-listed `podcasts`)
// rendered a Space with NO accent scope at all: the same manage dashboard read one way inside the
// profile at `?panel=manage` and another way at `/spaces/<slug>/manage`, byte-identical component,
// two looks. The ADR named it and named the missing guard in the same breath: "nothing guards any of
// it — no check asserts a Space route renders `AccentScope`".
//
// THE FIX is structural, not per-page: the scope moved UP to `[slug]/layout.tsx`, the one layout that
// already resolves the Space and wraps every route beneath it. So this guard is not a list of
// subtrees to keep in sync (which is the thing that rots); it walks the real route tree and proves
// the invariant for whatever is there today.
//
// These assertions FAIL against the pre-fix tree: the walk reports every route outside `(profile)`
// as unscoped (26 of 35 route entries), and the single-scope test cannot fire at all because no
// chain carried two.

const SPACE_ROOT = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

/** Files Next.js renders INSIDE the layout chain of their own folder. `loading.tsx` belongs here:
 *  a loading file is the Suspense fallback for its segment's children, so it renders inside the
 *  layout SHARING its folder — which is exactly why the pre-fix `[slug]/loading.tsx` sat outside the
 *  scope one level below it, and why moving the scope up covers it too. `route.ts`, the metadata
 *  image routes (`opengraph-image`, `twitter-image`) and `sitemap`/`manifest` files render no React
 *  tree under a layout at all, so they are not route entries for this purpose. */
const ROUTE_ENTRY = /^(page|default|loading)\.tsx?$/

/** Collect every route entry file under `dir`, repo-relative and POSIX-shaped. */
function routeEntries(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) routeEntries(full, out)
    else if (ROUTE_ENTRY.test(entry.name)) out.push(full)
  }
  return out
}

/** The layout files that wrap `file`, from its own folder up to (and including) `[slug]`. Route
 *  GROUPS (`(profile)`) are ordinary folders here, which is how Next resolves them too. */
function layoutChain(file: string): string[] {
  const chain: string[] = []
  let dir = dirname(file)
  for (;;) {
    const layout = join(dir, 'layout.tsx')
    if (existsSync(layout)) chain.push(layout)
    if (dir === SPACE_ROOT.replace(/\/$/, '')) break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return chain
}

const rel = (p: string) => relative(REPO_ROOT, p).split('\\').join('/')

/** Does this layout source MOUNT an AccentScope (not merely mention it in prose)? */
function mountsAccentScope(layout: string): boolean {
  return /<AccentScope[\s>]/.test(readFileSync(layout, 'utf8'))
}

const entries = routeEntries(SPACE_ROOT)

describe('Space accent scoping (LIVE-196, ADR-1192)', () => {
  it('finds the Space route tree (the walk itself is load-bearing)', () => {
    // A guard that silently measures nothing is worse than no guard: if the folder is renamed or the
    // walk breaks, every assertion below passes vacuously. Pin that it found a real tree, including
    // at least one route in each subtree the ADR named.
    expect(entries.length).toBeGreaterThan(20)
    for (const subtree of ['manage', 'settings', 'crm', 'marketing', 'podcasts']) {
      expect(entries.some((f) => rel(f).includes(`/[slug]/${subtree}/`))).toBe(true)
    }
  })

  it('renders EVERY route under /spaces/[slug] inside an AccentScope', () => {
    const unscoped = entries.filter((f) => !layoutChain(f).some(mountsAccentScope)).map(rel)
    expect(unscoped).toEqual([])
  })

  it('establishes the scope exactly ONCE per route (no nested, desynchronisable wrapper)', () => {
    // Two AccentScopes in one chain is not a visual bug today (the inner repeats the outer's values)
    // but it is the shape that lets them drift: a second wrapper reading a second source of the same
    // Space is how "the theme leaked the other way" started. One Space, one scope.
    const doubled = entries
      .map((f) => ({ route: rel(f), scopes: layoutChain(f).filter(mountsAccentScope).map(rel) }))
      .filter((r) => r.scopes.length > 1)
    expect(doubled).toEqual([])
  })
})

describe('AccentScope contract (LIVE-196, ADR-1192)', () => {
  const source = readFileSync(join(REPO_ROOT, 'components/spaces/accent-scope.tsx'), 'utf8')

  it('types the theme prop as SpaceThemeId, not string', () => {
    // The real gate is tsc: with `theme?: string` a misspelt id compiled fine and rendered a live
    // `data-space-theme` attribute matching no CSS block, so the Space silently lost its typography.
    // This pins the source so a widening back to `string` is loud rather than silent.
    expect(source).not.toMatch(/theme\?:\s*string\b/)
    expect(source).toMatch(/theme\?:\s*SpaceThemeId\b/)
    expect(source).toMatch(/from '@\/lib\/theme\/space-themes'/)
  })
})

describe('Space share card mirrors the on-page shape (LIVE-196, ADR-1192)', () => {
  // Satori has no access to the CSS token system, so the OG route mirrors DAWN tokens as literals.
  // A mirror is only worth anything if something checks it still reflects: the logo chip carried
  // `borderRadius: 28`, which matches no theme and no token, under a header claiming the card
  // "MIRRORS THE ON-PAGE HERO". The chip on the page is `BrandAnchor`, which rides `--radius-cover`.
  const globalsCss = readFileSync(join(REPO_ROOT, 'app/globals.css'), 'utf8')
  const og = readFileSync(join(SPACE_ROOT, 'opengraph-image.tsx'), 'utf8')

  it('sets the OG logo chip radius from the --radius-cover baseline', () => {
    const token = globalsCss.match(/^\s*--radius-cover:\s*(\d+)px;/m)
    expect(token, 'app/globals.css declares a --radius-cover baseline').not.toBeNull()

    const mirrored = og.match(/^const COVER_RADIUS = (\d+)\b/m)
    expect(mirrored, 'opengraph-image.tsx names its mirrored cover radius').not.toBeNull()

    expect(Number(mirrored![1])).toBe(Number(token![1]))
    expect(og).toMatch(/borderRadius: COVER_RADIUS,/)
    expect(og).not.toMatch(/borderRadius:\s*28\b/)
  })
})
