// LIVE-1681: the Temple Theme Kit is pickable, as the Network Theme Kit is. Consequences, not spelling:
//   1. the owner-facing theme list offers `temple-kit` and not the earlier `temple`, which still resolves (its live site is untouched);
//   2. the registry loads a kit per profile (id temple-kit-<niche>), each home the design's thirteen TempleKit blocks;
//   3. the editor, the library and the wizard list the kit, and no list offers the earlier Temple.
// Fails on main (no kits, no entry). Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/temple-kit-registered.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')

// 1.
const { SITE_THEMES, SITE_THEME_DEFS } = await import('../../lib/theme/site-style.ts')
assert.ok(SITE_THEMES.some((t) => t.id === 'temple-kit'), 'the picker offers the Temple Theme Kit')
assert.ok(!SITE_THEMES.some((t) => t.id === 'temple'), 'the picker no longer offers the earlier Temple')
assert.ok(SITE_THEME_DEFS.some((t) => t.id === 'temple'), 'the earlier Temple still resolves, so Royal Temple renders as before')

// 2.
assert.ok(r('lib/sites/kits/registry.ts').includes('`temple-kit-${niche}`'), 'the registry loads a kit per profile')
const { templeKitProfileKit } = await import('../../lib/sites/kits/temple-kit-profile-variants.ts')
const { templeKitHomeBlocks } = await import('../../lib/sites/temple-kit-home.ts')
const { MEGA_NICHES } = await import('../../lib/theme/mega-theme.ts')
assert.equal(MEGA_NICHES.length, 13, 'thirteen niches')
const order = templeKitHomeBlocks().map((b) => b.type).join()
for (const niche of MEGA_NICHES) {
  const kit = templeKitProfileKit(niche)
  assert.equal(kit.id, `temple-kit-${niche}`)
  assert.equal(kit.theme, 'TempleKit')
  assert.equal(kit.pages[0].blocks.map((b) => b.type).join(), order, `${kit.id} home is the design's Home`)
  assert.ok(kit.pages.every((p) => p.blocks.every((b) => b.type.startsWith('TempleKit'))), `${kit.id} uses only TempleKit blocks`)
}

// 3.
const { THEME_LIBRARY, themePagePath } = await import('../../lib/themes/library.ts')
assert.ok(THEME_LIBRARY.some((t) => t.id === 'temple-kit') && !THEME_LIBRARY.some((t) => t.id === 'temple'), 'the library lists the kit, not the earlier Temple')
assert.equal(themePagePath('temple-kit'), '/themes/temple')
const { WIZARD_THEMES } = await import('../../lib/spaces/create-wizard.ts')
assert.ok(WIZARD_THEMES.some((t) => t.id === 'temple-kit') && !WIZARD_THEMES.some((t) => t.id === 'temple'), 'the wizard offers the kit, not the earlier Temple')
const { WEBSITE_THEMES, WEBSITE_THEMES_LIVE } = await import('../../lib/sites/editor/state.ts')
assert.ok(WEBSITE_THEMES.includes('TempleKit'), 'the editor accepts a TempleKit website')
assert.ok(!WEBSITE_THEMES_LIVE.has('TempleKit'), 'the public site keeps its house look until TempleKit is turned on')
console.log('LIVE-1681: the Temple Theme Kit is registered and pickable; the earlier Temple is retired from every list.')
