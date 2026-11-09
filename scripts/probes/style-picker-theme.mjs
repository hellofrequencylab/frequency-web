#!/usr/bin/env node
// Run with scripts/probe-ts.mjs to exercise the same picker and site-style resolvers as the editor.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MEGA_THEMES } from '../../lib/theme/mega-theme.ts'
import { readSiteStyle, siteLook } from '../../lib/theme/site-style.ts'
import { resolveWebsiteBrand } from '../../lib/sites/editor/state.ts'
import { themeAccents, themeEditor } from '../../lib/themes/editor-dials.ts'

const [id, corners, spacing, header, footer, ...expectedLooks] = process.argv.slice(2)
const theme = MEGA_THEMES.find((entry) => entry.id === id)
assert(theme?.site, `No site theme for ${id}`)
const manifest = JSON.parse(readFileSync(new URL(`../../lib/themes/manifests/${id}.manifest.json`, import.meta.url), 'utf8'))
const declaration = JSON.parse(readFileSync(new URL('../../lib/themes/editor-schema2.json', import.meta.url), 'utf8'))[id]
assert.equal(manifest.schema, 2)
assert(declaration?.functions, `Missing function map for ${id}`)
assert.deepEqual(manifest.legacyIds, { editor: theme.editor, site: theme.site })
assert.deepEqual(manifest.editor.dials, declaration.dials)
assert.deepEqual(manifest.editor.looks, declaration.looks)
assert.deepEqual(manifest.editor.functions, declaration.functions)

const defaults = { corners, spacing, header, footer }
assert.deepEqual(siteLook(readSiteStyle({ siteStyle: { theme: theme.site } })), defaults)
const picker = themeEditor(theme.site)
for (const dial of Object.keys(defaults)) assert(picker.dials.some((entry) => entry.id === dial), `Missing dial ${dial}`)
assert.deepEqual(picker.looks.filter((look) => look.id !== 'own').map((look) => look.id), expectedLooks)

const inherited = { accent: '#123456' }
const snapshot = { theme: theme.editor, pages: [] }
assert.equal(resolveWebsiteBrand(snapshot, inherited).accent, inherited.accent)
for (const { dials } of picker.looks) {
  if (!dials.accent) continue
  const swatch = themeAccents(theme.editor).find(({ id }) => id === dials.accent)
  assert(swatch, `Unknown accent ${dials.accent}`)
  assert.equal(resolveWebsiteBrand({ ...snapshot, look: dials }, inherited).accent, swatch.swatch)
}
console.log(`style-picker-theme ${id}: ok`)
