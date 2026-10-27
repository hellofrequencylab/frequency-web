import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── LIVE-1509: A WHITE-LABEL WEBSITE THEME NEVER STYLES A FREQUENCY MEMBER OR ADMIN AREA ──────────
//
// Daniel, 2026-10-27, after /spaces/house-of-fates/manage rendered with Midnight's washed-out ground:
// "Themes from the white labeled section NEVER bleed into the Frequency member area." The leak was the
// Space layout handing the Space's website surface, faces, accent and font set to the one AccentScope that
// wraps the console. A site theme is scoped to the stand-alone site render (components/sites/*) and nothing
// else: not app/(main), not the signed-out Space and event pages under app/(public), not the Space components
// the member pages compose. The one thing a Frequency page may take from a site is the structural sheet the
// Network sections need (NETWORK_BLOCK_CSS). Fix the code; never loosen this list.

const MAIN = fileURLToPath(new URL('.', import.meta.url))
const REPO = fileURLToPath(new URL('../../', import.meta.url))

/** Every Frequency-hosted tree a Space's website theme must stay out of. */
const ROOTS = ['app/(main)', 'app/(public)/spaces', 'app/(public)/events', 'components/spaces', 'components/frequency/members'].map((r) => join(REPO, r))

/** The only names a Frequency page may take from the Network site sheet module. */
const NETWORK_ALLOWED = new Set(['NETWORK_BLOCK_CSS', 'docHasNetworkBlocks'])

/** The resolvers that turn a Space's website theme into styles. Member and admin routes use the
 *  member* helpers (the Space's own fonts, its own brand accent) instead. */
const SITE_THEME_RESOLVERS = /\b(pageSurface|emailSurface|spacePageSiteFaces|spacePageFonts|spacePageDefaultAccent|SITE_FACE_SHEETS|SITE_FACE_VARS|surfaceCssVars)\b/

/** Site theme skins and their CSS: only the site renderer may import them. */
const SITE_THEME_MODULES =
  /from '@\/(components\/sites\/(?:midnight|designer|temple|house|menswork|wildheart|site-look|frequency-page)[\w-]*-css|lib\/theme\/(?:midnight|designer|temple|menswork|wildheart|network|surface|site-faces)(?:-[\w-]+)?)'/

/** Names imported from components/sites/network-css that are more than the block sheet. */
function networkOverreach(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@\/components\/sites\/network-css'/g)) {
    for (const name of m[1].split(',').map((n) => n.trim().replace(/^type\s+/, '')).filter(Boolean)) if (!NETWORK_ALLOWED.has(name)) out.push(name)
  }
  return out
}

const rel = (p: string) => relative(REPO, p).split('\\').join('/')

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) sources(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const files = ROOTS.flatMap((root) => sources(root))
/** AccentScope still carries the optional surface and faces plumbing; the next check holds that nobody passes them. */
const SCOPE_FILE = 'components/spaces/accent-scope.tsx'
const guarded = files.filter((f) => rel(f) !== SCOPE_FILE)

describe('no site theme in the member or admin area (LIVE-1509)', () => {
  it('walks the member tree (the walk itself is load-bearing)', () => {
    expect(files.length).toBeGreaterThan(200)
    expect(files.map(rel)).toContain('app/(main)/spaces/[slug]/layout.tsx')
    expect(files.map(rel)).toContain('app/(public)/spaces/[slug]/layout.tsx')
    expect(files.map(rel)).toContain('components/spaces/network-page-scope.tsx')
  })

  it('never resolves a website theme into styles on a Frequency-hosted page', () => {
    const offenders = guarded.filter((f) => SITE_THEME_RESOLVERS.test(readFileSync(f, 'utf8'))).map(rel)
    expect(offenders).toEqual([])
  })

  it('never imports a site theme skin or its CSS', () => {
    const offenders = guarded.filter((f) => SITE_THEME_MODULES.test(readFileSync(f, 'utf8'))).map(rel)
    expect(offenders).toEqual([])
  })

  it('never hands AccentScope a website surface or website faces', () => {
    const offenders = files
      .filter((f) => /<AccentScope[^>]*\b(surface|siteFaces)=/.test(readFileSync(f, 'utf8')))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('takes only the structural block sheet from the Network site module', () => {
    const offenders = files.filter((f) => networkOverreach(readFileSync(f, 'utf8')).length > 0).map(rel)
    expect(offenders).toEqual([])
  })

  it('keeps both Space layouts on the Space\'s own look: no surface, no faces', () => {
    for (const layout of [join(MAIN, 'spaces/[slug]/layout.tsx'), join(REPO, 'app/(public)/spaces/[slug]/layout.tsx')]) {
      const src = readFileSync(layout, 'utf8')
      expect(src, rel(layout)).not.toMatch(/surface=\{/)
      expect(src, rel(layout)).not.toMatch(/siteFaces=\{/)
      expect(src, rel(layout)).toMatch(/memberSpaceFonts/)
    }
  })
})
