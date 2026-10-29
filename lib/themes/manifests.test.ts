import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import MAP from '@/lib/theme/block-contract-map.json'
import CONTRACT from '@/lib/sites/editor/theme-contract.json'
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { SITE_THEMES, SITE_THEME_DEFS } from '@/lib/theme/site-style'
import { THEME_LIBRARY, themePagePath } from './library'

// THE THEME MANIFESTS (LIVE-1857, docs/THEME-COHESION.md, ADR-1923). One JSON file per Mega Theme in
// lib/themes/manifests/<id>.manifest.json: the one record the catalog, picker, Try it on, editor and
// design-system intake read. GENERATED, never hand-edited, from MEGA_THEMES (ids and the two legacy ids),
// SITE_THEME_DEFS (label, description), THEME_LIBRARY (the words), theme-contract.json (the editor's tokens)
// and block-contract-map.json (the core token mapping). This file is the generator and the drift test:
//   pnpm gen:theme-manifests        (UPDATE_THEME_MANIFESTS=1 rewrites the files)
// Legacy ids are kept forever: `legacyIds.editor` and `legacyIds.site` are the values saved sites already hold.
// Nothing here is read by a live render yet, so a site renders exactly as before.

const DIR = join(process.cwd(), 'lib/themes/manifests')
const file = (id: string) => join(DIR, `${id}.manifest.json`)

type Json = Record<string, unknown>
const contractThemes = (CONTRACT as unknown as { themes: Record<string, Json> }).themes
const derived = (CONTRACT as unknown as { derived: Record<string, string> }).derived
const coreMap = (MAP as unknown as { themes: Record<string, { names: Record<string, string> }> }).themes

function build(def: (typeof MEGA_THEMES)[number]): Json {
  const site = def.site ? SITE_THEME_DEFS.find((s) => s.id === def.site) ?? null : null
  const lib = THEME_LIBRARY.find((t) => t.id === def.id) ?? null
  const { niches, ...editorTokens } = (contractThemes[def.editor] ?? {}) as Json & { niches?: Json }
  return {
    schema: 1,
    id: def.id,
    legacyIds: { editor: def.editor, site: def.site },
    offered: SITE_THEMES.some((s) => s.id === def.site) && lib !== null,
    site: site ? { label: site.label, description: site.description, defaultFonts: site.defaultFonts } : null,
    library: lib ? { tagline: lib.tagline, madeFor: lib.madeFor, signature: lib.signature, surfaces: lib.surfaces, page: themePagePath(lib.id) } : null,
    editor: { tokens: editorTokens, niches: niches ?? null, derived },
    core: { names: coreMap[def.id]?.names ?? null },
  }
}

const expected = MEGA_THEMES.map((d) => ({ id: d.id, json: JSON.stringify(build(d), null, 2) + '\n' }))

if (process.env.UPDATE_THEME_MANIFESTS === '1') {
  mkdirSync(DIR, { recursive: true })
  for (const e of expected) writeFileSync(file(e.id), e.json)
}

describe('theme manifests', () => {
  it('has one manifest per Mega Theme and no stray ones', () => {
    expect(readdirSync(DIR).filter((f) => f.endsWith('.manifest.json')).sort()).toEqual(expected.map((e) => `${e.id}.manifest.json`).sort())
    expect(expected.length).toBeGreaterThanOrEqual(9)
  })
  it('matches its sources exactly (drift fails; run pnpm gen:theme-manifests)', () => {
    for (const e of expected) expect(existsSync(file(e.id)) ? readFileSync(file(e.id), 'utf8') : null, e.id).toBe(e.json)
  })
  it('keeps every legacy id and carries the full core token mapping', () => {
    for (const d of MEGA_THEMES) {
      const m = JSON.parse(readFileSync(file(d.id), 'utf8')) as { legacyIds: { editor: string; site: string | null }; core: { names: Record<string, string> | null } }
      expect(m.legacyIds).toEqual({ editor: d.editor, site: d.site })
      expect(Object.keys(m.core.names ?? {}).length, d.id).toBeGreaterThanOrEqual(45)
    }
  })
  it('lists a theme as offered only when the picker and the library both offer it', () => {
    const offered = expected.filter((e) => (JSON.parse(e.json) as { offered: boolean }).offered).map((e) => e.id)
    expect(offered).toEqual(THEME_LIBRARY.map((t) => t.id))
  })
})
