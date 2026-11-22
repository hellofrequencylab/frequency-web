import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRIVATE_THEME_SITES, SITE_THEMES, SITE_THEME_DEFS, isPrivateTheme, mayWearTheme, themesForSpace } from '@/lib/theme/site-style'
import { THEME_LIBRARY, themeIdFromSlug } from '@/lib/themes/library'
import { THEME_SHARE_CARDS } from '@/lib/themes/share-cards'
import { PREVIEW_KIT_ORDER } from '@/lib/theme/preview-tokens'
import { WIZARD_THEMES } from '@/lib/spaces/create-wizard'

// PRIVATE THEMES (owner ask 2026-11-22: "themes for different sites, that won't go in the public system"). A private theme is
// offered only to the Spaces it is assigned to (PRIVATE_THEME_SITES) and never reaches a public surface. This walks every
// public list and fails the moment a private id appears on one, and pins who may wear what.

const privateIds = SITE_THEME_DEFS.map((t) => t.id).filter(isPrivateTheme)
const read = (path: string) => readFileSync(path, 'utf8')
/** Every /themes/<slug> address a source file names, as the theme id each one shows. */
const themeIdsLinkedFrom = (path: string) =>
  [...read(path).matchAll(/\/themes\/([a-z0-9-]+)/g)].map((m) => themeIdFromSlug(m[1])).filter((id): id is string => !!id)

describe('private themes', () => {
  it('names the sites of every private theme, and only of private themes', () => {
    expect(privateIds.length).toBeGreaterThan(0)
    expect(Object.keys(PRIVATE_THEME_SITES).sort()).toEqual([...privateIds].sort())
  })

  it('never reach a public list', () => {
    const publicLists: Record<string, readonly string[]> = {
      SITE_THEMES: SITE_THEMES.map((t) => t.id),
      THEME_LIBRARY: THEME_LIBRARY.map((t) => t.id),
      THEME_SHARE_CARDS: THEME_SHARE_CARDS.map((c) => c.id),
      PREVIEW_KIT_ORDER,
      WIZARD_THEMES: WIZARD_THEMES.map((t) => t.id),
      '/themes showcase (KIT_THEMES)': [...read('components/frequency/site/pages/themes/frequency-themes.tsx').matchAll(/theme: '([a-z0-9-]+)'/g)].map((m) => m[1]),
      'app/sitemap.ts': themeIdsLinkedFrom('app/sitemap.ts'),
      'app/llms.txt/route.ts': themeIdsLinkedFrom('app/llms.txt/route.ts'),
    }
    for (const [list, ids] of Object.entries(publicLists)) {
      expect(ids.filter(isPrivateTheme), `${list} names a private theme`).toEqual([])
    }
  })

  it('may be worn only by an assigned Space, or one that already wears it', () => {
    expect(mayWearTheme('network', 'the-group', 'network')).toBe(true)
    expect(mayWearTheme('network', 'the-group-oceanside', 'new-world')).toBe(true)
    expect(mayWearTheme('temple', 'royaltemple', 'new-world')).toBe(true)
    expect(mayWearTheme('network', 'someone-else', 'new-world')).toBe(false)
    expect(mayWearTheme('temple', null, 'new-world')).toBe(false)
    // Default is every unpicked Space's read fallback, so a save may return to it; no picker offers it (below).
    expect(mayWearTheme('frequency', 'someone-else', 'new-world')).toBe(true)
    // Public themes are open to every Space; an unknown id to none.
    for (const t of SITE_THEMES) expect(mayWearTheme(t.id, 'someone-else', 'new-world'), t.id).toBe(true)
    expect(mayWearTheme('not-a-theme', 'the-group', 'network')).toBe(false)
  })

  it('offers a Space the public themes plus its own private ones, and never offers Default', () => {
    expect(themesForSpace('someone-else')).toEqual(SITE_THEMES)
    expect(themesForSpace(null)).toEqual(SITE_THEMES)
    expect(themesForSpace('the-group').map((t) => t.id)).toEqual([...SITE_THEMES.map((t) => t.id), 'network'])
    expect(themesForSpace('royaltemple').map((t) => t.id)).toEqual([...SITE_THEMES.map((t) => t.id), 'temple'])
    for (const slug of ['someone-else', 'the-group', 'royaltemple']) expect(themesForSpace(slug).some((t) => t.id === 'frequency'), slug).toBe(false)
  })
})
