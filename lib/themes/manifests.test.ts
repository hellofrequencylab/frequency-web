import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import MAP from '@/lib/theme/block-contract-map.json'
import CONTRACT from '@/lib/sites/editor/theme-contract.json'
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { SITE_THEMES, SITE_THEME_DEFS } from '@/lib/theme/site-style'
import { THEME_LIBRARY, themePagePath } from './library'
import SCHEMA2 from './editor-schema2.json'
import DIALS from '@/lib/theme/dials.json'
import { dialsFor, looksFor, type ThemeEditorDecl } from '@/lib/theme/dials'

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
const schema2 = SCHEMA2 as unknown as Record<string, Json>
const contractThemes = (CONTRACT as unknown as { themes: Record<string, Json> }).themes
const coreMap = (MAP as unknown as { themes: Record<string, { names: Record<string, string> }> }).themes

function build(def: (typeof MEGA_THEMES)[number]): Json {
  const site = def.site ? SITE_THEME_DEFS.find((s) => s.id === def.site) ?? null : null
  const lib = THEME_LIBRARY.find((t) => t.id === def.id) ?? null
  return {
    // Schema 2 (LIVE-1997) is schema 1 plus the editor's dials, looks and resolver, from editor-schema2.json. A theme
    // with no entry there is schema 1 and shows the four dials it always had.
    schema: schema2[def.id] ? 2 : 1,
    id: def.id,
    legacyIds: { editor: def.editor, site: def.site },
    offered: SITE_THEMES.some((s) => s.id === def.site) && lib !== null,
    site: site ? { label: site.label, description: site.description, defaultFonts: site.defaultFonts } : null,
    library: lib ? { tagline: lib.tagline, madeFor: lib.madeFor, signature: lib.signature, surfaces: lib.surfaces, page: themePagePath(lib.id) } : null,
    // Pointers, never copies: palette values live in one place, and the drift test resolves these at test time.
    editor: { tokens: { source: 'lib/sites/editor/theme-contract.json', path: ['themes', def.editor] }, ...(schema2[def.id] ?? {}) },
    // A theme the core token contract does not cover yet (Free Human) carries no mapping; the roles fall back to the house one.
    core: coreMap[def.id] ? { names: { source: 'lib/theme/block-contract-map.json', path: ['themes', def.id, 'names'] } } : null,
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
      const m = JSON.parse(readFileSync(file(d.id), 'utf8')) as { legacyIds: { editor: string; site: string | null }; editor: { tokens: { path: string[] } }; core: { names: { path: string[] } } | null }
      expect(m.legacyIds).toEqual({ editor: d.editor, site: d.site })
      expect(contractThemes[m.editor.tokens.path[1]], d.id).toBeDefined()
      if (m.core) expect(Object.keys(coreMap[m.core.names.path[1]]?.names ?? {}).length, d.id).toBeGreaterThanOrEqual(45)
      else expect(coreMap[d.id], `${d.id} has a core mapping but its manifest does not point at it`).toBeUndefined()
    }
  })
  it('lists a theme as offered only when the picker and the library both offer it', () => {
    const offered = expected.filter((e) => (JSON.parse(e.json) as { offered: boolean }).offered).map((e) => e.id)
    expect(offered).toEqual(THEME_LIBRARY.map((t) => t.id))
  })
})

// SCHEMA 2 (LIVE-1997): every dial a theme names exists in the registry, every default and Look value is one of its
// options, and a schema 1 theme (no entry) resolves to exactly the four dials it always had.
describe('manifest schema 2', () => {
  const registry = new Map((DIALS.dials as { id: string; options: unknown }[]).map((d) => [d.id, d]))
  it('names only registry dials and gives every theme the four legacy dials or more', () => {
    for (const [id, decl] of Object.entries(schema2) as [string, ThemeEditorDecl][]) {
      expect(MEGA_THEMES.some((m) => m.id === id), id).toBe(true)
      for (const key of Object.keys(decl.dials ?? {})) expect(registry.has(key), `${id}.${key}`).toBe(true)
      const dials = dialsFor(decl)
      for (const l of looksFor(decl, dials)) expect(Object.keys(l.dials).every((k) => dials.some((d) => d.id === k)), `${id} look ${l.id}`).toBe(true)
    }
  })
  it('shows a schema 1 theme exactly the four legacy dials', () => {
    expect(dialsFor(null).map((d) => d.id)).toEqual(['corners', 'spacing', 'header', 'footer'])
    expect(dialsFor({ dials: {} }).length).toBe(0)
  })
})
