import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── LIVE-1509: A WHITE-LABEL WEBSITE THEME NEVER STYLES A FREQUENCY MEMBER OR ADMIN AREA ──────────
//
// Daniel, 2026-10-27, after /spaces/house-of-fates/manage rendered with Midnight's washed-out ground:
// "Themes from the white labeled section NEVER bleed into the Frequency member area." The leak was the
// Space layout handing the Space's website surface, faces, accent and font set to the one AccentScope that
// wraps the console. A site theme is scoped to the stand-alone site render (components/sites/*) and, for
// the signed-out share page, app/(public). Nothing under app/(main) outside the public profile group may
// resolve or import one. Fix the code; never loosen this list.

const MAIN = fileURLToPath(new URL('.', import.meta.url))
const REPO = fileURLToPath(new URL('../../', import.meta.url))

/** The resolvers that turn a Space's website theme into styles. Member and admin routes use the
 *  member* helpers (the Space's own fonts, its own brand accent) instead. */
const SITE_THEME_RESOLVERS = /\b(pageSurface|emailSurface|spacePageSiteFaces|spacePageFonts|spacePageDefaultAccent|SITE_FACE_SHEETS|SITE_FACE_VARS|surfaceCssVars)\b/

/** Site theme skins and their CSS: only the site renderer may import them. */
const SITE_THEME_MODULES =
  /from '@\/(components\/sites\/(?:midnight|designer|temple|house|menswork|wildheart|network|site-look|frequency-page)[\w-]*-css|lib\/theme\/(?:midnight|designer|temple|menswork|wildheart|network|surface|site-faces)(?:-[\w-]+)?)'/

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) sources(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const rel = (p: string) => relative(REPO, p).split('\\').join('/')
const files = sources(MAIN)

describe('no site theme in the member or admin area (LIVE-1509)', () => {
  it('walks the member tree (the walk itself is load-bearing)', () => {
    expect(files.length).toBeGreaterThan(200)
    expect(files.map(rel)).toContain('app/(main)/spaces/[slug]/layout.tsx')
  })

  it('never resolves a website theme into styles under app/(main)', () => {
    const offenders = files.filter((f) => SITE_THEME_RESOLVERS.test(readFileSync(f, 'utf8'))).map(rel)
    expect(offenders).toEqual([])
  })

  it('never imports a site theme skin or its CSS outside the public profile group', () => {
    const offenders = files
      .filter((f) => !rel(f).startsWith('app/(main)/spaces/[slug]/(profile)/'))
      .filter((f) => SITE_THEME_MODULES.test(readFileSync(f, 'utf8')))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('keeps the Space layout on the Space\'s own look: no surface, no faces', () => {
    const layout = readFileSync(join(MAIN, 'spaces/[slug]/layout.tsx'), 'utf8')
    expect(layout).not.toMatch(/surface=\{/)
    expect(layout).not.toMatch(/siteFaces=\{/)
    expect(layout).toMatch(/memberSpaceFonts/)
  })
})
