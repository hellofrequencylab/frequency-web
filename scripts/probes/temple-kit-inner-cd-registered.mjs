// LIVE-1899: the Temple Theme Kit's inner blocks of groups C and D are registered in the page editor, and the thirteen profile kits
// carry the Programs, Shop and Library pages. Fails on main (not registered, no such pages).
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/temple-kit-inner-cd-registered.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const config = readFileSync('lib/page-editor/config.tsx', 'utf8')
assert.match(config, /\.\.\.templeKitInnerCComponents,/, 'the editor registers the Programs blocks')
assert.match(config, /\.\.\.templeKitInnerDComponents,/, 'the editor registers the Shop and Library blocks')
assert.match(config, /Object\.keys\(templeKitInnerCComponents\)/, 'the Temple Kit palette lists the Programs blocks')
assert.match(config, /Object\.keys\(templeKitInnerDComponents\)/, 'the Temple Kit palette lists the Shop and Library blocks')

const { templeKitProfileKit } = await import('../../lib/sites/kits/temple-kit-profile-variants.ts')
const { MEGA_NICHES } = await import('../../lib/theme/mega-theme.ts')
for (const niche of MEGA_NICHES) {
  const slugs = templeKitProfileKit(niche).pages.map((p) => p.slug)
  for (const slug of ['programs', 'shop', 'library']) assert.ok(slugs.includes(slug), `temple-kit-${niche} has ${slug}`)
}
console.log('temple-kit-inner-cd-registered: ok')
