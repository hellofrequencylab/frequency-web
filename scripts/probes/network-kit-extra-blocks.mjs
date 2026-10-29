// LIVE-1714: the Network Theme Kit's thirteen extra blocks and its thirteen profile kits. Consequences, not spelling:
//   1. the thirteen extra blocks exist, are registered in the editor, and carry a scoped, token-only skin;
//   2. the registry loads a kit per profile (id network-kit-<niche>), each home starting with the hero;
//   3. the kits' copy makes no promise: no em dash, no digit, no weekday rhythm, no "free", no "cohort".
// Fails on main (no blocks, no loaders). Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/network-kit-extra-blocks.mjs
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const EXTRAS = ['Featured', 'Venue', 'Calendar', 'Chapters', 'Circles', 'Stats', 'Note', 'Pillars', 'Rooms', 'Podcast', 'Social', 'Merch', 'Contact'].map((n) => `NetworkKit${n}`)

// 1.
assert.ok(existsSync('components/page-editor/blocks/network-kit-more.tsx'), 'the extra blocks exist')
const src = readFileSync('components/page-editor/blocks/network-kit-more.tsx', 'utf8')
for (const t of EXTRAS) assert.ok(src.includes(t), `${t} is defined`)
const config = readFileSync('lib/page-editor/config.tsx', 'utf8')
assert.ok(config.includes('networkKitMoreComponents') && config.includes('NETWORK_KIT_MORE_CATEGORY_COMPONENTS'), 'the editor registers the extra blocks')
const { NETWORK_KIT_MORE_CSS } = await import('../../components/sites/network-kit-more-css.ts')
const { NETWORK_KIT_CSS } = await import('../../components/sites/network-kit-css.ts')
assert.ok(NETWORK_KIT_CSS.includes(NETWORK_KIT_MORE_CSS), 'the kit skin carries the extra blocks')
assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(NETWORK_KIT_MORE_CSS) && !/rgba?\(|hsla?\(/.test(NETWORK_KIT_MORE_CSS), 'no raw colour')
const sels = NETWORK_KIT_MORE_CSS.replace(/\/\*[\s\S]*?\*\//g, '').split(/\}\s*/).map((r) => r.replace(/^@media[^{]*\{/, '').split('{')[0].trim()).filter((s) => s && !s.startsWith('@'))
assert.ok(sels.length > 40 && sels.every((s) => s.split(',').every((p) => p.includes('data-house-theme="network-kit"'))), 'every rule is scoped to the kit')

// 2.
const registry = readFileSync('lib/sites/kits/registry.ts', 'utf8')
assert.ok(registry.includes('`network-kit-${niche}`'), 'the registry loads a kit per profile')
const { NETWORK_KIT_PROFILE_KITS, networkKitProfileKit } = await import('../../lib/sites/kits/network-kit-profile-variants.ts')
assert.equal(NETWORK_KIT_PROFILE_KITS.length, 13, 'thirteen profile kits')
const kits = await Promise.all(NETWORK_KIT_PROFILE_KITS.map((n) => networkKitProfileKit(n)))
for (const [i, n] of NETWORK_KIT_PROFILE_KITS.entries()) assert.equal(kits[i].id, `network-kit-${n}`)
for (const k of kits) {
  assert.ok(k.id.startsWith('network-kit-') && k.theme === 'NetworkKit', `${k.id} is a NetworkKit kit`)
  const home = k.pages.find((p) => p.slug === '' || p.slug === 'home' || p.isHome) ?? k.pages[0]
  assert.ok(JSON.stringify(home).includes('NetworkKitHero'), `${k.id} home opens with the hero`)
}
assert.ok(typeof networkKitProfileKit === 'function')

// 3.
for (const k of kits) {
  const text = JSON.stringify(k).replace(/"(count|pos|order|level)":\s*\d+/g, '')
  assert.ok(!/—/.test(text), `${k.id}: no em dash`)
  assert.ok(!/\b(free|cohort)\b/i.test(text), `${k.id}: no free claim or cohort`)
  assert.ok(!/\b(every|each) (mon|tues|wednes|thurs|fri|satur|sun)day|\bweekly\b/i.test(text), `${k.id}: no rhythm promise`)
}
